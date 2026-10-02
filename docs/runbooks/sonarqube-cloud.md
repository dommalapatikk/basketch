# SonarQube Cloud setup and daily use

Plain-English guide for the PM. SonarQube Cloud (sonarcloud.io) is free for
public repos (the repo must stay public; private repos need a paid plan, and our
budget rule allows only one paid service). It reads our code on every pull request and gives a pass/fail
"quality gate". The gate plus our existing CI checks decide whether a PR can merge.

Code side is already done (`sonar-project.properties`, the `SonarQube Cloud` job
in `.github/workflows/ci.yml`). The steps below are the parts only you can do.

## One-time setup

1. Go to https://sonarcloud.io and click **Log in** > **GitHub**. Authorise SonarCloud.
2. Click **+** (top right) > **Analyze new project**. Choose organization
   `dommalapatikk` (import it from GitHub if asked), then select the
   `basketch` repository and click **Set Up**.
3. If asked what counts as "new code", choose **Number of days: 30**. (We do not
   set a project version, so "Previous version" would grow forever. PR gates always
   judge the PR's own changes; this setting only affects the `main` branch view.)
   If asked how to analyse, choose **With GitHub Actions**, but do not
   copy the workflow it offers: ours is already in the repo. Do not paste any
   token into a file.
4. **Turn OFF Automatic Analysis.** Project > **Administration** > **Analysis Method**
   > switch **SonarCloud Automatic Analysis** to **off**. This is required: if it
   stays on, our GitHub Actions scan fails with "You are running CI analysis while
   Automatic Analysis is enabled" and the job is red forever.
5. Confirm the two keys. Project > **Information**: copy **Project Key** and
   **Organization Key**. They must match `sonar.projectKey` and `sonar.organization`
   at the top of `sonar-project.properties` (we guessed `dommalapatikk_basketch` and
   `dommalapatikk`). If they differ, tell the engineer (or edit that file) before
   the first PR.
6. Create a token: avatar (top right) > **My Account** > **Security** > generate a
   token named `basketch-ci`. Copy it now; it is shown once.
7. Add it to GitHub: repo > **Settings** > **Secrets and variables** > **Actions**
   > **New repository secret**. Name: `SONAR_TOKEN`. Value: the token. Save.
8. Quality gate: Project > **Quality Gate**. Leave the default **Sonar way**
   (see below).
9. Hand back to the engineer. They will open a first PR and check the Sonar job
   runs. **Before branch protection makes `web-next · Vitest` a required check,
   the 2 failing tests in `web-next/src/app/[locale]/deals/DealsClient.test.tsx`
   (the "From" date label) must be fixed.** While they are red, every PR is blocked.
   Then turn on branch protection.

## What the default "Sonar way" gate checks

It only looks at **new code** (the lines changed in the PR), so old problems do
not block you. To pass:

- No new bugs (reliability rating A)
- No new vulnerabilities (security rating A)
- New security hotspots all reviewed (100%)
- New code coverage at least 80%
- New code duplication at most 3%
- Maintainability rating on new code A

If a PR changes fewer than 20 lines, the coverage and duplication conditions are
skipped, so a tiny PR without tests can still pass.

## Reading a failed gate on a PR

1. Open the PR. In the checks list at the bottom, find **SonarQube Cloud** (red) and
   **SonarCloud / SonarQube Cloud Code Analysis** (the gate verdict; the name
   depends on SonarSource's current branding).
2. Click **Details** on the SonarCloud one. It opens the SonarCloud PR page
   showing which condition failed, for example "Coverage on New Code 62% (needs 80%)".
3. Click the failed condition to see the exact files and lines.
4. Fix in the PR branch and push; the gate re-runs automatically.
5. A flagged issue that is a false alarm: in SonarCloud open the issue and
   mark it **Accept** or **False positive** with a reason, then re-run the job.
   A security hotspot must be marked **Reviewed**, which needs a person, not code.

## When something else is wrong

| What you see | Meaning | Fix |
|---|---|---|
| Job fails "SONAR_TOKEN missing" | Secret not added or misnamed | Step 7 |
| "Project not found" / "organization" error | Keys in `sonar-project.properties` wrong | Step 5 |
| "Automatic Analysis is enabled" | Step 4 not done | Step 4 |
| Job skipped with a notice about forks | PR is from a fork; GitHub hides secrets | Re-create the branch inside this repo |
| Coverage shows 0% | A test job failed before writing coverage | Fix the red test job first |
| Whole CI red but Sonar fine | A test is failing, for now `DealsClient.test.tsx` in web-next | Fix that test |

Rotate the token: repeat steps 6 and 7 (replace the secret), and revoke the old one.
