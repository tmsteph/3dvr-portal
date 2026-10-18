import unittest
from businesszero import State
from businesszero_rl import ACTIONS, choose, observe, policy, summarize, train
import random


class BusinessZeroRLTests(unittest.TestCase):
    def test_deterministic_training(self):
        self.assertEqual(train(episodes=12, seed=2), train(episodes=12, seed=2))

    def test_valid_actions(self):
        q = train(episodes=8)
        action = policy(q)(State())
        self.assertIn(action, ACTIONS)

    def test_no_future_leakage(self):
        a = State(cash=1000, customers=0, day=2)
        b = State(cash=1000, customers=900, day=2)
        self.assertEqual(observe(a), observe(b))

    def test_empty_episodes(self):
        with self.assertRaises(ValueError):
            train(episodes=0)

    def test_greedy_tie_breaking(self):
        self.assertEqual(choose({}, State(), random.Random(0)), 0)

    def test_held_out_evaluation(self):
        metrics = summarize(range(200000, 200003), policy(train(episodes=10)))
        self.assertGreaterEqual(metrics["survival_rate"], 0)
        self.assertLessEqual(metrics["survival_rate"], 1)


if __name__ == "__main__":
    unittest.main()
