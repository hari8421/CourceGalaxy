---
title: "Week 2 — Attention and Your First Transformer"
track: "scratch"
week: 2
order: 2
type: "module"
hours: 15
summary: "Queries, keys, values, causal masking, multi-head attention, residuals — assembled into a real GPT that trains on TinyStories and writes grammatical stories."
tags: ["attention", "transformer", "gpt", "multi-head", "tinystories", "architecture"]
---

# Week 2 — Attention and Your First Transformer

**Goal by Friday:** a ~10–30M parameter GPT written by you, trained on TinyStories, producing
short stories that are grammatical and locally coherent. Loss under ~2.0 on the validation
split.

---

## 1. Concepts (2 h)

### 1.1 The problem attention solves

A bigram sees one token. An MLP over three tokens sees three. To write "the cat sat on the
___", a model must look back an arbitrary distance and decide *which* earlier words matter.

A recurrent network does this sequentially — slow, and forgetful over long spans. **Attention**
lets every position look at every earlier position **at once**, and learn how much to care.

### 1.2 Queries, keys, values

The most useful analogy: a **soft dictionary lookup**.

- each token emits a **query** — "what am I looking for?"
- each token emits a **key** — "what do I offer?"
- each token emits a **value** — "what do I actually pass along?"

Compare each query with every key; the better the match, the more of that key's value you take.

```
scores = Q · Kᵀ / √d          how relevant is each past token to me
scores = mask(scores)         cannot look into the future
weights = softmax(scores)     turn relevance into a distribution
output = weights · V          a weighted average of the past
```

The `√d` divisor keeps the scores from growing with dimension; without it, softmax saturates
and gradients vanish.

### 1.3 Why masking matters

Language models are trained to predict the next token, so at position `t` they must not see
position `t+1`. Without the causal mask, the model trivially copies the answer, loss collapses
to near zero, and generation at inference is garbage — because at inference the future does
not exist.

This is the single most common "it trains but generates nonsense" bug in from-scratch
projects.

### 1.4 Multi-head: several conversations at once

One attention head can only express one kind of relationship. Split the embedding into `n_head`
slices and let each head learn its own pattern — one tracks syntax, another tracks coreference,
another tracks position. Concatenate and project back.

```
n_embd = 384, n_head = 6  →  head_dim = 64
```

### 1.5 The full block

```
x = x + Attention(LayerNorm(x))     # communication between positions
x = x + MLP(LayerNorm(x))           # computation within each position
```

Three details that matter:

- **Residuals (`x + …`)** give gradients a highway straight to the embeddings. Without them,
  deep stacks do not train.
- **LayerNorm before the sublayer** (pre-norm) is what modern models use; it is far more stable
  than the original post-norm.
- **The MLP is 4× wide** (`n_embd → 4·n_embd → n_embd`). Most of the parameters live here.

---

## 2. Lab — build the GPT (5 h)

### 2.1 Self-attention, complete

```python
import torch, torch.nn as nn, torch.nn.functional as F

class CausalSelfAttention(nn.Module):
    def __init__(self, n_embd, n_head, block_size, dropout=0.1):
        super().__init__()
        assert n_embd % n_head == 0, "n_embd must be divisible by n_head"
        self.n_head, self.head_dim = n_head, n_embd // n_head
        self.qkv = nn.Linear(n_embd, 3 * n_embd, bias=False)
        self.proj = nn.Linear(n_embd, n_embd, bias=False)
        self.dropout = nn.Dropout(dropout)
        # 1 = allowed, 0 = masked. Lower triangular.
        self.register_buffer(
            "mask",
            torch.tril(torch.ones(block_size, block_size)).view(1, 1, block_size, block_size),
        )

    def forward(self, x):
        B, T, C = x.shape
        q, k, v = self.qkv(x).split(C, dim=2)
        # (B, T, C) -> (B, n_head, T, head_dim)
        shape = (B, T, self.n_head, self.head_dim)
        q = q.view(shape).transpose(1, 2)
        k = k.view(shape).transpose(1, 2)
        v = v.view(shape).transpose(1, 2)

        att = (q @ k.transpose(-2, -1)) * (self.head_dim ** -0.5)   # (B, H, T, T)
        att = att.masked_fill(self.mask[:, :, :T, :T] == 0, float("-inf"))
        att = F.softmax(att, dim=-1)
        att = self.dropout(att)

        y = (att @ v).transpose(1, 2).contiguous().view(B, T, C)
        return self.proj(y)
```

Check the shapes on paper before you run it: `q @ k.transpose(-2,-1)` gives `(B, H, T, T)` —
one score for every (query position, key position) pair.

### 2.2 The block and the model

```python
class Block(nn.Module):
    def __init__(self, n_embd, n_head, block_size, dropout=0.1):
        super().__init__()
        self.ln1 = nn.LayerNorm(n_embd)
        self.attn = CausalSelfAttention(n_embd, n_head, block_size, dropout)
        self.ln2 = nn.LayerNorm(n_embd)
        self.mlp = nn.Sequential(
            nn.Linear(n_embd, 4 * n_embd), nn.GELU(),
            nn.Linear(4 * n_embd, n_embd), nn.Dropout(dropout),
        )

    def forward(self, x):
        x = x + self.attn(self.ln1(x))
        x = x + self.mlp(self.ln2(x))
        return x


class GPT(nn.Module):
    def __init__(self, vocab_size, n_layer=6, n_head=6, n_embd=384,
                 block_size=256, dropout=0.1):
        super().__init__()
        self.block_size = block_size
        self.tok_emb = nn.Embedding(vocab_size, n_embd)
        self.pos_emb = nn.Embedding(block_size, n_embd)
        self.blocks = nn.Sequential(*[
            Block(n_embd, n_head, block_size, dropout) for _ in range(n_layer)
        ])
        self.ln_f = nn.LayerNorm(n_embd)
        self.head = nn.Linear(n_embd, vocab_size, bias=False)
        self.apply(self._init)
        # Tie the output head to the token embedding: fewer params, better small models.
        self.head.weight = self.tok_emb.weight

    @staticmethod
    def _init(m):
        if isinstance(m, (nn.Linear, nn.Embedding)):
            nn.init.normal_(m.weight, mean=0.0, std=0.02)
        if isinstance(m, nn.Linear) and m.bias is not None:
            nn.init.zeros_(m.bias)

    def forward(self, idx, targets=None):
        B, T = idx.shape
        assert T <= self.block_size, f"sequence {T} > block_size {self.block_size}"
        pos = torch.arange(T, device=idx.device)
        x = self.tok_emb(idx) + self.pos_emb(pos)     # (B, T, C)
        x = self.blocks(x)
        logits = self.head(self.ln_f(x))              # (B, T, vocab)

        loss = None
        if targets is not None:
            loss = F.cross_entropy(
                logits.view(B * T, logits.size(-1)), targets.view(B * T)
            )
        return logits, loss

    @torch.no_grad()
    def generate(self, idx, max_new_tokens=200, temperature=1.0, top_k=None):
        for _ in range(max_new_tokens):
            idx_cond = idx[:, -self.block_size:]       # crop to context window
            logits, _ = self(idx_cond)
            logits = logits[:, -1, :] / temperature
            if top_k is not None:
                v, _ = torch.topk(logits, min(top_k, logits.size(-1)))
                logits[logits < v[:, [-1]]] = float("-inf")
            probs = F.softmax(logits, dim=-1)
            nxt = torch.multinomial(probs, 1)
            idx = torch.cat((idx, nxt), dim=1)
        return idx
```

**Parameter count, before you train.** Transformer blocks hold roughly `12 · n_layer · n_embd²`
parameters:

```python
def count_params(model):
    return sum(p.numel() for p in model.parameters() if p.requires_grad)

m = GPT(vocab_size=50257, n_layer=6, n_head=6, n_embd=384, block_size=256)
print(f"{count_params(m)/1e6:.1f}M params")     # ~10.6M with tied embeddings
```

Because the head is tied, the 50k × 384 embedding (`~19M`) is counted once. Tying is why a
10M-parameter model is possible with a 50k vocabulary — untied, you would pay it twice.

### 2.3 Data: tokenize once, then memory-map

Do not tokenize inside the training loop. Encode the whole corpus once into a `uint16` binary
file and `np.memmap` it:

```python
import numpy as np, tiktoken
enc = tiktoken.get_encoding("gpt2")

ids = enc.encode_ordinary(open("data/TinyStories-train.txt").read())
arr = np.array(ids, dtype=np.uint16)
print(len(arr) / 1e6, "M tokens")
arr[: int(0.98 * len(arr))].tofile("data/train.bin")
arr[int(0.98 * len(arr)):].tofile("data/val.bin")
```

```python
def get_batch(split, batch_size=32, block_size=256, device="cpu"):
    data = np.memmap(f"data/{split}.bin", dtype=np.uint16, mode="r")
    ix = torch.randint(len(data) - block_size - 1, (batch_size,))
    x = torch.stack([torch.from_numpy(data[i:i + block_size].astype(np.int64)) for i in ix])
    y = torch.stack([torch.from_numpy(data[i + 1:i + 1 + block_size].astype(np.int64)) for i in ix])
    return x.to(device), y.to(device)
```

`y` is `x` shifted by exactly one — the entire training signal in one line.

### 2.4 Scale configs you can actually train

| Preset | n_layer | n_head | n_embd | block | params | Where it runs |
| --- | --- | --- | --- | --- | --- | --- |
| tiny | 4 | 4 | 128 | 128 | ~1M | CPU, minutes |
| small | 6 | 6 | 384 | 256 | ~10.6M | M-series, ~1–3 h |
| medium | 8 | 8 | 512 | 256 | ~25M | M-series 32GB, ~3–6 h |
| large | 12 | 12 | 768 | 256 | ~85M | 48GB Mac or a GPU, overnight |

Start at `tiny` to prove the pipeline works end to end — 200 steps, look at the loss, generate
something. **Only then** move up a rung. Half of all failed from-scratch projects are people
debugging a pipeline and a large model simultaneously.

### 2.5 First run and first samples

```python
import torch
from model import GPT

device = "mps" if torch.backends.mps.is_available() else "cpu"
model = GPT(vocab_size=50257, n_layer=6, n_head=6, n_embd=384, block_size=256).to(device)
opt = torch.optim.AdamW(model.parameters(), lr=3e-4)

for step in range(3000):
    x, y = get_batch("train", 16, 256, device)
    _, loss = model(x, y)
    opt.zero_grad(set_to_none=True)
    loss.backward()
    torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
    opt.step()
    if step % 250 == 0:
        print(step, round(loss.item(), 3))

start = torch.zeros((1, 1), dtype=torch.long, device=device)
print(enc.decode(model.generate(start, 120, temperature=0.8, top_k=40)[0].tolist()))
```

What progress looks like on TinyStories:

| Step | Loss | Sample |
| --- | --- | --- |
| 0 | ~10.9 | `\x00�JF]...` (random bytes) |
| 250 | ~4.2 | `the the and the...` |
| 1,000 | ~2.6 | `once upon a time there was a girl named lily . she` |
| 3,000 | ~2.0 | short story with a beginning, a problem, and an ending |

If you are at loss 4.2 after an hour, **stop and fix the pipeline** — do not add compute.

---

## 3. Practical drills (2 h)

| # | Drill | Teaches |
| --- | --- | --- |
| 1 | Remove the causal mask and sample | Perfect training loss, useless generation |
| 2 | Remove the residual connections | Deep stack refuses to learn |
| 3 | Remove the `√d` divisor | Softmax saturates, loss plateaus |
| 4 | Set `n_head=1` at the same width | What heads actually buy |
| 5 | Generate with `block_size` context vs 16 | Context length in your hands |
| 6 | Print `model.blocks[0].attn.mask` | The mask is a tensor you can read |

---

## 4. Deliverable — `gpt-tiny` on GitHub

- [ ] `model.py` — attention, block, GPT, with comments on every tensor shape
- [ ] `data.py` — tokenize-once, memmap, `get_batch`
- [ ] `train.py` — CLI args for every hyperparameter
- [ ] `samples/before.txt` and `samples/after.txt` — step 0 and the final model
- [ ] `loss.png` with the validation curve
- [ ] `NOTES.md` — parameter count, tokens seen, hours trained, final losses

**Interview question this earns you:** *"Why does attention need a mask?"* — "Because the
training objective is next-token prediction. Without the mask, position `t` can see `t+1`, so
the loss collapses while generation has no future to read from."

---

## 5. Self-check

1. In `scores = Q·Kᵀ`, what is one row? One column?
2. What breaks without `√head_dim`, and why is it dimension-dependent?
3. Why do residuals make deep networks trainable?
4. What is the difference between `block_size` and the model's parameter count?
5. Why does removing the mask make training loss *better* and generation *worse*?
6. Your model has 10M parameters and a 50k vocabulary. Why is that possible?

---

## 6. Cheat sheet

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Loss ~0.001, samples gibberish | Mask missing or wrong | Re-check `tril` and `masked_fill` |
| `shape` error in attention | Forgot `.transpose(1,2)` before the matmul | `(B,T,H,D) → (B,H,T,D)` |
| `sequence > block_size` assert | Prompt longer than context | Crop with `idx[:, -block_size:]` |
| Loss stuck at ~10.8 | Learning rate too low, or labels not shifted | LR 3e-4; check `y = x + 1` |
| Loss falls then spikes to NaN | LR too high for the batch size | Lower LR, add gradient clipping |
| Samples repeat one phrase | Overfit, or temperature too low | More data; raise temperature; top_k |
