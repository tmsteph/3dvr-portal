"""Train and evaluate a simple BusinessZero policy without external dependencies.

This is grid-search policy optimization, NOT transformer training or AlphaZero.
Training and held-out evaluation use disjoint market seeds.

Run: python3 experiments/businesszero_train.py
"""
import json
from businesszero import Action, fixed_policy, random_policy_factory, run


PRICES = (12, 16, 20, 24, 28, 32, 35)
MARKETING = (0, 10, 25, 50, 75, 100)


def constant_policy(price, marketing):
    return lambda state: Action(price, marketing)


def mean_profit(seeds, policy):
    seeds = tuple(seeds)
    if not seeds:
        raise ValueError("Provide at least one seed")
    return sum(run(seed, policy)["profit"] for seed in seeds) / len(seeds)


def train(train_seeds):
    """Fit a constant action policy using only the supplied training seeds."""
    train_seeds = tuple(train_seeds)
    if not train_seeds:
        raise ValueError("Training seeds cannot be empty")
    best = None
    for price in PRICES:
        for marketing in MARKETING:
            score = mean_profit(train_seeds, constant_policy(price, marketing))
            candidate = (score, -marketing, -price, price, marketing)
            if best is None or candidate > best:
                best = candidate
    return {"price": best[3], "marketing": best[4],
            "train_mean_profit": round(best[0], 2)}


def evaluate(model, test_seeds):
    test_seeds = tuple(test_seeds)
    if not test_seeds:
        raise ValueError("Evaluation seeds cannot be empty")
    trained = constant_policy(model["price"], model["marketing"])
    policies = {
        "trained": trained,
        "fixed": fixed_policy,
    }
    report = {}
    for name, policy in policies.items():
        outcomes = [run(seed, policy) for seed in test_seeds]
        report[name] = {
            "mean_profit": round(sum(r["profit"] for r in outcomes) / len(outcomes), 2),
            "survival_rate": round(sum(r["survived"] for r in outcomes) / len(outcomes), 3),
        }
    random_outcomes = [run(seed, random_policy_factory(seed + 10000)) for seed in test_seeds]
    report["random"] = {
        "mean_profit": round(sum(r["profit"] for r in random_outcomes) / len(random_outcomes), 2),
        "survival_rate": round(sum(r["survived"] for r in random_outcomes) / len(random_outcomes), 3),
    }
    return report


def experiment():
    train_seeds = tuple(range(100))
    test_seeds = tuple(range(1000, 1100))
    assert not set(train_seeds).intersection(test_seeds)
    model = train(train_seeds)
    return {
        "method": "grid_search_constant_policy",
        "simulator": "toy_microbusiness_v1",
        "train_seeds": len(train_seeds),
        "test_seeds": len(test_seeds),
        "model": model,
        "held_out": evaluate(model, test_seeds),
        "caveat": "Synthetic simulator only; no demonstrated real-world profitability",
    }


if __name__ == "__main__":
    print(json.dumps(experiment(), indent=2))
