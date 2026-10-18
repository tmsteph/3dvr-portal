"""BusinessZero: reproducible, dependency-free microbusiness benchmark.

Run: python3 experiments/businesszero.py
Test: python3 -m unittest discover -s experiments -p 'test_businesszero.py'
This is a toy simulator, NOT a validated model of real markets.
"""
from dataclasses import dataclass
import json
import random


@dataclass
class State:
    cash: float = 1000.0
    customers: int = 0
    profit: float = 0.0
    day: int = 0


@dataclass(frozen=True)
class Action:
    price: float
    marketing: float


class Market:
    def __init__(self, seed=0, days=30):
        self.rng = random.Random(seed)
        self.days = days
        self.state = State()
        self.base_demand = self.rng.uniform(12, 24)
        self.competitor_price = self.rng.uniform(12, 22)
        self.unit_cost = 6.0
        self.daily_overhead = 12.0

    def step(self, action):
        if self.state.day >= self.days:
            raise RuntimeError("Episode finished")
        if not (8 <= action.price <= 35 and 0 <= action.marketing <= 100):
            raise ValueError("Action outside permitted bounds")
        s = self.state
        # Marketing must be affordable; overhead and inventory may still cause insolvency.
        marketing = min(action.marketing, max(0.0, s.cash))
        affordability = max(0.0, 1 - 0.045 * (action.price - self.competitor_price))
        expected = max(0.0, self.base_demand * affordability + 0.08 * marketing)
        interested = max(0, round(expected * self.rng.uniform(0.7, 1.3)))
        affordable_units = int(max(0, s.cash - marketing) // self.unit_cost)
        sold = min(interested, affordable_units)
        revenue = sold * action.price
        cost = sold * self.unit_cost + marketing + self.daily_overhead
        delta = revenue - cost
        s.cash += delta
        s.profit += delta
        s.customers += sold
        s.day += 1
        done = s.day >= self.days or s.cash <= 0
        return {"reward": delta, "sold": sold, "cash": round(s.cash, 2),
                "done": done}


def fixed_policy(state):
    return Action(price=18, marketing=10)


def random_policy_factory(seed):
    rng = random.Random(seed)
    return lambda state: Action(rng.uniform(8, 35), rng.uniform(0, 100))


def run(seed, policy, days=30):
    market = Market(seed, days)
    while True:
        result = market.step(policy(market.state))
        if result["done"]:
            break
    s = market.state
    return {"seed": seed, "profit": round(s.profit, 2),
            "cash": round(s.cash, 2), "customers": s.customers,
            "days_survived": s.day, "survived": s.cash > 0}


def benchmark(seeds=range(100)):
    policies = {"fixed": fixed_policy,
                "random": None}
    output = {}
    for name, policy in policies.items():
        results = [run(seed, policy or random_policy_factory(seed + 10000))
                   for seed in seeds]
        if not results:
            raise ValueError("At least one seed required")
        output[name] = {
            "mean_profit": round(sum(r["profit"] for r in results) / len(results), 2),
            "survival_rate": round(sum(r["survived"] for r in results) / len(results), 3),
            "mean_customers": round(sum(r["customers"] for r in results) / len(results), 2)}
    return output


if __name__ == "__main__":
    print(json.dumps(benchmark(), indent=2))
