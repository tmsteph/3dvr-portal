"""BusinessZero tabular Q-learning baseline.

No dependencies; trains on randomized synthetic markets, evaluates on unseen seeds.
Not a transformer or evidence of real-world business profitability.

Run: python3 experiments/businesszero_rl.py
"""
import json
import random
from businesszero import Action, Market, fixed_policy, run
from businesszero_train import constant_policy, train as train_grid

ACTIONS = tuple(Action(price, marketing) for price in (12, 18, 24, 30, 35)
                for marketing in (0, 10, 30, 60))


def observe(state):
    """Use only observable state, never hidden demand/competitor parameters."""
    cash_band = min(9, max(0, int(state.cash // 500)))
    day_band = min(5, state.day // 5)
    return (cash_band, day_band)


def choose(q, state, rng, epsilon=0.0):
    if rng.random() < epsilon:
        return rng.randrange(len(ACTIONS))
    values = q.get(observe(state), [0.0] * len(ACTIONS))
    # Deterministic tie-breaking.
    return max(range(len(ACTIONS)), key=lambda i: (values[i], -i))


def train(episodes=1500, seed=7, alpha=0.15, gamma=0.95):
    if episodes < 1:
        raise ValueError("episodes must be positive")
    rng = random.Random(seed)
    q = {}
    for episode in range(episodes):
        market = Market(seed=rng.randrange(1_000_000_000))
        epsilon = max(0.05, 0.8 * (1 - episode / episodes))
        while True:
            key = observe(market.state)
            values = q.setdefault(key, [0.0] * len(ACTIONS))
            index = choose(q, market.state, rng, epsilon)
            result = market.step(ACTIONS[index])
            next_key = observe(market.state)
            future = 0.0 if result["done"] else max(
                q.get(next_key, [0.0] * len(ACTIONS)))
            target = result["reward"] + gamma * future
            values[index] += alpha * (target - values[index])
            if result["done"]:
                break
    return q


def policy(q):
    # Deterministic greedy evaluation, no exploration.
    rng = random.Random(0)
    return lambda state: ACTIONS[choose(q, state, rng)]


def summarize(seeds, strategy):
    results = [run(seed, strategy) for seed in seeds]
    return {
        "mean_profit": round(sum(x["profit"] for x in results) / len(results), 2),
        "survival_rate": round(sum(x["survived"] for x in results) / len(results), 3),
        "mean_customers": round(sum(x["customers"] for x in results) / len(results), 2),
    }


def experiment(episodes=1500):
    q = train(episodes=episodes)
    # Grid-search baseline is fit on a separate training set.
    grid = train_grid(range(100))
    test_seeds = tuple(range(200000, 200100))
    return {
        "method": "tabular_q_learning",
        "episodes": episodes,
        "states_learned": len(q),
        "evaluation": {
            "q_learning": summarize(test_seeds, policy(q)),
            "fixed": summarize(test_seeds, fixed_policy),
            "grid_search": summarize(
                test_seeds, constant_policy(grid["price"], grid["marketing"])),
        },
        "note": "All results are from a simplified synthetic environment; compare baselines before drawing conclusions.",
    }


if __name__ == "__main__":
    print(json.dumps(experiment(), indent=2))
