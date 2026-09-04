# Current GPT-6 Astra compatibility gap

As of September 3, 2026, `main` still has GPT-5-name-based request-shape checks in Site Builder, Guide, Forge, and Money Printer. Those checks suppress `temperature` for GPT-5 models only. If `gpt-6-astra` is selected without fixing that logic, the request builders can attach a parameter Astra does not support.

Site Builder, Guide, and Forge also use curated hard-coded model lists that do not yet include `gpt-6-astra`.

The first code change should therefore be compatibility-first: model capability handling + regression tests, then opt-in Astra selection. Do not switch production defaults in the same change.
