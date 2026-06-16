import json
import urllib.request

BASE = "http://localhost:7071/api/query"

def ask(question, history):
    payload = json.dumps({"question": question, "history": history}).encode()
    req = urllib.request.Request(BASE, data=payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())

history = []
turns = [
    "What failures have we had with the P4 Belt Conveyor?",
    "What about the same machine but only breakdown cases?",
    "How long did that usually take to fix?",
]

for i, q in enumerate(turns, 1):
    print(f"\n{'='*60}")
    print(f"Turn {i}: {q}")
    r = ask(q, history)
    print(f"Rewritten to: {r['query_used']}")
    print(f"WOs retrieved: {len(r['work_orders'])}")
    print(f"Answer (first 400 chars):\n{r['answer'][:400]}...")
    history.append({"role": "user",      "content": q})
    history.append({"role": "assistant", "content": r["answer"]})

print("\n" + "="*60)
print("✅ Multi-turn test complete")
