import unittest
from businesszero_train import constant_policy, evaluate, experiment, train


class PolicyTrainingTests(unittest.TestCase):
    def test_training_is_reproducible(self):
        self.assertEqual(train(range(5)), train(range(5)))

    def test_trained_action_is_valid(self):
        model = train(range(3))
        action = constant_policy(model["price"], model["marketing"])(None)
        self.assertGreaterEqual(action.price, 8)
        self.assertLessEqual(action.price, 35)
        self.assertGreaterEqual(action.marketing, 0)
        self.assertLessEqual(action.marketing, 100)

    def test_held_out_comparison(self):
        results = evaluate(train(range(3)), range(1000, 1003))
        self.assertEqual(set(results), {"trained", "fixed", "random"})
        for metrics in results.values():
            self.assertIn("mean_profit", metrics)
            self.assertGreaterEqual(metrics["survival_rate"], 0)
            self.assertLessEqual(metrics["survival_rate"], 1)

    def test_empty_training_rejected(self):
        with self.assertRaises(ValueError):
            train([])

    def test_empty_evaluation_rejected(self):
        with self.assertRaises(ValueError):
            evaluate(train(range(2)), [])


if __name__ == "__main__":
    unittest.main()
