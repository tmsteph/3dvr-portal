#!/usr/bin/env python3
"""Hacker Fab GRBL offline synthetic regression model (no physical hardware).

Upstream reference: hacker-fab/stepper PR #55, head 9bd72c69fdf659166275157d293957228e4be798
Source: src/stage_control/grbl_stage.py, blob 0309b09a79a3dd4f4e0ba9dcd578a1bf49235b21
Review: https://github.com/hacker-fab/stepper/pull/55#issuecomment-6381446432

This is a small, dependency-free model of the observed byte-framing and unbounded
polling patterns, NOT an import/execution of the upstream driver or hardware test.
The original flawed behaviors are asserted as known regressions; candidate
remedies are tested separately. Run: python3 hackerfab_grbl_synthetic_regression.py
"""
import unittest


def old_ack(chunks):
    """Current split/clear pattern from _send_msg; returns whether an ACK was seen."""
    buf = b""
    for chunk in chunks:
        buf += chunk
        if b"\r\n" not in buf:
            continue
        parts = buf.split(b"\r\n")
        buf = b""  # flawed: loses the incomplete suffix
        if any(part.strip() == b"ok" for part in parts):
            return True
    return False


def preserved_ack(chunks):
    """Candidate suffix-preserving line parser."""
    buf = b""
    for chunk in chunks:
        buf += chunk
        if b"\r\n" not in buf:
            continue
        parts = buf.split(b"\r\n")
        buf = parts.pop()
        if any(part.strip() == b"ok" for part in parts):
            return True
    return False


def old_poll(chunks, terminator, sentinel_reads=7):
    """Model _query_state/_query_config: no deadline/backoff on empty reads."""
    buf = b""
    for i in range(sentinel_reads):
        buf += chunks[i] if i < len(chunks) else b""
        if terminator in buf:
            return True, i + 1
    return False, sentinel_reads  # harness sentinel, NOT an upstream timeout


def bounded_poll(chunks, terminator, max_reads=6):
    """Candidate bounded polling with a deterministic fake clock/read budget."""
    buf = b""
    for i in range(max_reads):
        buf += chunks[i] if i < len(chunks) else b""
        if terminator in buf:
            return True
    raise TimeoutError("GRBL polling deadline exceeded")


class Framing(unittest.TestCase):
    def test_01_original_unfragmented_control(self):
        self.assertTrue(old_ack([b"[MSG:hello]\r\nok\r\n"]))

    def test_02_original_fragmented_ack_reproduces_loss(self):
        self.assertFalse(old_ack([b"[MSG:hello]\r\no", b"k\r\n"]))

    def test_03_remedy_preserves_fragmented_ack(self):
        self.assertTrue(preserved_ack([b"[MSG:hello]\r\no", b"k\r\n"]))

    def test_04_remedy_handles_no_complete_line_then_ack(self):
        self.assertTrue(preserved_ack([b"o", b"k", b"\r", b"\n"]))


class StartupPolling(unittest.TestCase):
    def test_05_original_state_poll_has_no_timeout(self):
        success, reads = old_poll([], b">\r\n")
        self.assertFalse(success)
        self.assertEqual(reads, 7)

    def test_06_original_config_poll_has_no_timeout(self):
        success, reads = old_poll([], b"ok")
        self.assertFalse(success)
        self.assertEqual(reads, 7)

    def test_07_bounded_state_poll_times_out(self):
        with self.assertRaises(TimeoutError):
            bounded_poll([], b">\r\n")

    def test_08_bounded_config_poll_times_out(self):
        with self.assertRaises(TimeoutError):
            bounded_poll([], b"ok")

    def test_09_bounded_state_accepts_fragmented_response(self):
        self.assertTrue(bounded_poll([b"<Idle|MPos:0,0,0", b">\r", b"\n"], b">\r\n"))

    def test_10_bounded_config_accepts_fragmented_response(self):
        self.assertTrue(bounded_poll([b"$0=10\r\n", b"o", b"k\r\n"], b"ok"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
