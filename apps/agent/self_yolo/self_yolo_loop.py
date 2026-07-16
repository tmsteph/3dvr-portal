#!/usr/bin/env python3
import subprocess, sys, time

def main():
    if len(sys.argv) < 2:
        print('Usage: self-yolo-loop "task" [rounds]')
        sys.exit(1)

    task = sys.argv[1]
    rounds = int(sys.argv[2]) if len(sys.argv) > 2 else 3

    for i in range(1, rounds + 1):
        print(f"\n{'='*56}\n[self-yolo-loop] round {i}/{rounds}\n{'='*56}", flush=True)
        r = subprocess.run(["self-yolo-agent", task])
        if r.returncode != 0:
            print(f"[self-yolo-loop] stopped on round {i} (error)", flush=True)
            sys.exit(r.returncode)
        print(f"[self-yolo-loop] completed round {i}", flush=True)
        if i < rounds:
            time.sleep(2)

    print(f"\n[self-yolo-loop] done after {rounds} rounds", flush=True)

if __name__ == "__main__":
    main()
