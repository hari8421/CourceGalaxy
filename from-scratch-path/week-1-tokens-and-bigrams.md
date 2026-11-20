---
title: "Week 1 — Tokens and a Model That Barely Works"
track: "scratch"
week: 1
order: 1
type: "module"
hours: 12
summary: "Text becomes integers, integers become probabilities. Byte-pair encoding, the bigram model, cross-entropy loss, and sampling — the entire learning loop in under 100 lines."
tags: ["tokenizer", "bpe", "bigram", "cross-entropy", "sampling", "pytorch"]
---

# Week 1 — Tokens and a Model That Barely Works

**Goal by Friday:** a character-level bigram model that invents plausible names, trained in
under two minutes, with a loss curve you can explain and samples that get better as loss drops.

This week has almost no theory and almost all of the foundations. Do not skip it because it
looks simple.

---

## 1. Concepts (90 min)

### 1.1 Text → tokens → integers

Models do arithmetic, not words. The pipeline is:

```
"hello world"  →  tokenizer  →  [31373, 995]  →  embedding lookup  →  vectors
```

Two tokenizer families you will meet:

| Type | Vocabulary | Example | Trade-off |
| --- | --- | --- | --- |
| **Character** | ~65–100 | TinyShakespeare | Tiny vocab, long sequences, simple |
| **Subword (BPE)** | 32k–150k | GPT-2, Llama, Qwen | Short sequences, handles any text |

**Byte-pair encoding** in one paragraph: start with single bytes, count the most frequent
adjacent pair in your corpus, merge it into a new token, repeat 32,000 times. Frequent words
become one token (`the`), rare words split into pieces (`tokenization` → `token` + `ization`).
That is why models "can't spell": they never see letters, they see token ids.

For the first labs, use **characters**. Debugging a 65-token vocabulary is trivial; debugging a
50,000-token one is not. You will use `tiktoken` (GPT-2 BPE) in Week 2 when you want
realistic behaviour.

```python
# Character tokenizer: the whole thing
text = open("data/tinyshakespeare.txt").read()
chars = sorted(set(text))
stoi = {c: i for i, c in enumerate(chars)}
itos = {i: c for c, i in stoi.items()}
encode = lambda s: [stoi[c] for c in s]
decode = lambda ids: "".join(itos[i] for i in ids)
print(len(chars), "tokens in vocab", encode("hi")[:5])
```

### 1.2 The training objective, in one equation

For every position, the model outputs a score (logit) per vocabulary item. Softmax turns those
into probabilities. **Cross-entropy** measures how surprised the model was by the true next
token:

```
loss = -log( probability assigned to the correct next token )
```

| Probability given to the truth | Loss | Reading |
| --- | --- | --- |
| 0.99 | 0.01 | Almost certain, correct |
| 0.50 | 0.69 | Coin flip |
| 0.10 | 2.30 | Surprised |
| 0.001 | 6.90 | Shocked |

`ln(vocab_size)` is the loss of a uniform guess — for a 65-char vocabulary that is `ln(65) ≈
4.17`. **Your first model should start near that number.** If it starts at 0.1, you have a bug
(probably the labels are leaking into the input).

### 1.3 The bigram model: one token of context

Predict token `t+1` from token `t`, and nothing else. That is a 65×65 table of counts. You can
implement it with counting — no gradients at all — and it already generates text that looks
like the corpus's *texture*:

```python
import torch

N = torch.zeros((65, 65), dtype=torch.int32)
for w in words:                       # list of word strings
    for c1, c2 in zip(w, w[1:] + "."):
        N[stoi[c1], stoi[c2]] += 1

P = N.float()
P = P / P.sum(1, keepdim=True)        # row-normalise into probabilities
```

Now do the same thing with a neural net, because that is the pattern everything else follows:

```python
import torch.nn as nn, torch.nn.functional as F

class Bigram(nn.Module):
    def __init__(self, vocab):
        super().__init__()
        self.table = nn.Embedding(vocab, vocab)   # one row of logits per input token

    def forward(self, idx, targets=None):
        logits = self.table(idx)                  # (B, T, vocab)
        loss = None
        if targets is not None:
            B, T, V = logits.shape
            loss = F.cross_entropy(logits.view(B * T, V), targets.view(B * T))
        return logits, loss
```

Two lines of real substance: `nn.Embedding` is a lookup table, and `cross_entropy` expects a
flat `(N, vocab)` prediction against `(N,)` targets. The `view` is not decoration — it is the
single most common shape bug in every from-scratch project.

### 1.4 How learning actually happens (no calculus required)

```
1. forward  : compute logits and loss
2. backward : autograd computes d(loss)/d(each parameter)
3. step     : param -= learning_rate * gradient
```

A gradient is "which direction, and how steeply, does this number affect the loss". You do not
need to derive it. You do need to know three consequences:

- **Learning rate too high** → the step overshoots, loss explodes to NaN.
- **Learning rate too low** → loss crawls, and you conclude "it doesn't work".
- **No gradient for a parameter** → it never changes, no matter how long you train.

### 1.5 Sampling: turning probabilities into words

```python
def sample(model, n=20, temperature=1.0, seed=None):
    g = torch.Generator().manual_seed(seed or 0)
    out = [0]
    for _ in range(n):
        logits, _ = model(torch.tensor([out[-1:]]))
        probs = F.softmax(logits[0, -1] / temperature, dim=-1)
        nxt = torch.multinomial(probs, 1, generator=g).item()
        out.append(nxt)
    return out[1:]
```

- `temperature < 1` → sharper, more repetitive, "safer".
- `temperature > 1` → flatter, more creative, more nonsense.
- `temperature = 0` → always the argmax: deterministic and usually boring.

---

## 2. Lab — `names-bigram` (3 h)

Train a character model on a list of ~32,000 names and make it invent new ones.

### 2.1 Data and splits

```python
words = open("data/names.txt").read().splitlines()
import random; random.Random(0).shuffle(words)
n1, n2 = int(0.8 * len(words)), int(0.9 * len(words))
train, val, test = words[:n1], words[n1:n2], words[n2:]
print(len(train), len(val), len(test))
```

Always keep a **validation** split. It is how you will detect memorisation for the rest of the
course, and it costs you one line now.

### 2.2 Build batches

```python
block_size = 3          # context length; 1 for bigram, 3 for a tiny MLP

def build_dataset(words):
    X, Y = [], []
    for w in words:
        ctx = [0] * block_size + encode(w) + [0]     # 0 = start/end token
        for i in range(len(ctx) - block_size):
            X.append(ctx[i:i + block_size])
            Y.append(ctx[i + block_size])
    return torch.tensor(X), torch.tensor(Y)

Xtr, Ytr = build_dataset(train)
Xva, Yva = build_dataset(val)
print(Xtr.shape, Ytr.shape)     # torch.Size([N, 3]) torch.Size([N])
```

Note the shift: `X` is the context, `Y` is the *next* token. Getting this off by one is the
most common silent bug in language modelling — the model still trains, it just learns to copy
itself.

### 2.3 Train

```python
model = Bigram(len(chars))          # or the 3-gram MLP below
opt = torch.optim.AdamW(model.parameters(), lr=1e-3)

for step in range(10_000):
    ix = torch.randint(0, Xtr.shape[0], (32,))
    logits, loss = model(Xtr[ix], Ytr[ix])
    opt.zero_grad(set_to_none=True)
    loss.backward()
    opt.step()
    if step % 1000 == 0:
        with torch.no_grad():
            _, vloss = model(Xva, Yva)
        print(f"step {step:5d} train {loss.item():.3f} val {vloss.item():.3f}")
```

Expected bigram result: train loss around **2.45**, validation slightly higher, samples like
`kael`, `ann`, `josh`, `mari`. Nonsense, but *name-shaped* nonsense. That is a real result.

### 2.4 Upgrade to a tiny MLP (45 min)

Same data, three tokens of context, one hidden layer — and suddenly names get good:

```python
class MLP(nn.Module):
    def __init__(self, vocab, block, emb=16, hidden=128):
        super().__init__()
        self.emb = nn.Embedding(vocab, emb)
        self.fc1 = nn.Linear(block * emb, hidden)
        self.fc2 = nn.Linear(hidden, vocab)
        self.block = block

    def forward(self, idx, targets=None):
        x = self.emb(idx).view(idx.shape[0], -1)     # flatten context
        x = torch.tanh(self.fc1(x))
        logits = self.fc2(x)
        loss = F.cross_entropy(logits, targets) if targets is not None else None
        return logits, loss
```

Train loss drops to ~2.0 and samples become `marlin`, `kaelyn`, `jordyn`. You have now done,
in miniature, the exact loop you will use on a transformer.

### 2.5 Plot the loss and write down the numbers

```python
import matplotlib.pyplot as plt
plt.plot(steps, train_losses, label="train"); plt.plot(steps, val_losses, label="val")
plt.xlabel("step"); plt.ylabel("loss"); plt.legend(); plt.savefig("loss.png")
```

Commit `loss.png`. A picture of a falling curve is the cheapest proof of understanding there is.

---

## 3. Practical drills (2 h)

| # | Drill | Teaches |
| --- | --- | --- |
| 1 | Set LR to 0.1 and to 1e-6 | What divergence and stagnation each look like |
| 2 | Train on 500 names only | Overfitting: train → 0, val stays high |
| 3 | Reverse the shift (`Y = ctx[i:i+block]`) | The off-by-one bug, felt rather than read |
| 4 | Sample at temperature 0.3, 1.0, 2.0 | The creativity/reliability dial |
| 5 | Print `model.table.weight.shape` | Where the parameters actually live |
| 6 | Switch the vocabulary to words instead of characters | Why tokenization choices dominate everything |

---

## 4. Deliverable — `names-bigram` on GitHub

- [ ] `tokenizer.py` with `encode` / `decode` and a round-trip test
- [ ] `train.py` with the MLP model, explicit hyperparameters, and a val split
- [ ] `loss.png` showing train and validation curves
- [ ] `samples.txt` with 50 generated names at three temperatures
- [ ] `NOTES.md` with the final losses and what you changed to get there
- [ ] 20 minutes of your own generated names, marked good / fine / bad

**Interview question this earns you:** *"What is cross-entropy actually measuring?"* — "How
much probability the model assigned to the correct next token. Uniform guessing gives
`ln(vocab)`, so I use that as the sanity floor for a fresh model."

---

## 5. Self-check

1. Why does a fresh model's loss start near `ln(vocab_size)`?
2. What breaks if your targets are not shifted by one?
3. Why is a validation split useful before any real training?
4. What does temperature do to the probability distribution?
5. Your train loss is 0.05 and validation loss is 2.1. What happened, and what do you do?
6. Why does byte-pair encoding make "counting the r's in strawberry" hard?

---

## 6. Cheat sheet

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Loss starts near 0 | Targets leaked into inputs | Check the shift |
| `cross_entropy` shape error | Logits not flattened to `(N, V)` | `.view(B*T, V)` |
| Loss exactly `ln(vocab)` forever | No gradient flow, or LR ~0 | Check `requires_grad`, raise LR |
| NaN after a few steps | LR too high | 1e-3 → 1e-4 |
| Great train, bad val | Overfit | More data, fewer steps, smaller model |
| Samples are all the same name | Temperature 0, or memorised data | Sample with temperature, check the split |
