# GitHub setup

Repository: `dtanapot-max/ai-database-sandbox`

Recommended description:

> In-browser virtual MySQL/MariaDB behavioral sandbox for AI agents, testing, simulation, and automated verification. Powered by Core 1.2.

Recommended topics:

`ai`, `ai-agents`, `database`, `database-sandbox`, `sql`, `sql-sandbox`, `database-testing`, `mysql`, `mariadb`, `testing`, `javascript`, `browser`, `indexeddb`, `automation`

After the first push:

1. Open **Actions** and confirm `Node Regression` passes.
2. Run/inspect **Final Verification**. The IndexedDB browser gate must PASS before Freeze.
3. In **Settings → Pages**, select **GitHub Actions** if Pages is not already configured.
4. Confirm the Pages UI opens and Database → Table → Fields → Rows can be browsed.
5. Keep branch protection optional until the first workflows are confirmed; afterwards require the Node Regression status check for changes to `main` if desired.

Do not mark the project Known-Good/Freeze solely because the repository upload succeeded. The machine-readable `evidence/FINAL-STATUS.json` remains the verification decision source.
