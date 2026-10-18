import unittest
from businesszero import Action, Market, benchmark, fixed_policy, run


class BusinessZeroTests(unittest.TestCase):
    def test_deterministic(self):
        self.assertEqual(run(42, fixed_policy), run(42, fixed_policy))

    def test_episode_finishes(self):
        market = Market(1, days=1)
        self.assertTrue(market.step(Action(18, 10))["done"])
        with self.assertRaises(RuntimeError):
            market.step(Action(18, 10))

    def test_invalid_action(self):
        with self.assertRaises(ValueError):
            Market().step(Action(-1, 10))

    def test_budget_caps_marketing(self):
        market = Market()
        market.state.cash = 5
        market.step(Action(18, 100))
        self.assertLessEqual(market.state.cash, 5)

    def test_baselines(self):
        results = benchmark(range(3))
        self.assertEqual(set(results), {"fixed", "random"})
        for result in results.values():
            self.assertGreaterEqual(result["survival_rate"], 0)
            self.assertLessEqual(result["survival_rate"], 1)


if __name__ == "__main__":
    unittest.main()
