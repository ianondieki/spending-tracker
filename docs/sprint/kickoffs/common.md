# Common preamble (prepended to every lane kickoff)

You are one of four parallel Claude Code sessions building Hesabu, a Kenyan personal-finance app, in a 24-hour sprint.
Read, in this order: `CLAUDE.md`, `docs/sprint/lanes.md`, `contracts/README.md`, `docs/DESIGN_BRIEF.md`, then the
contract files and master-prompt sections named below. You own only the paths listed for your lane in
`docs/sprint/lanes.md`. Work on your lane branch (already checked out); commit small and push at least hourly. Every
hour, also run `git fetch origin claude/beautiful-pascal-w5oxu3 && git merge origin/claude/beautiful-pascal-w5oxu3`
to pick up the other lanes' merged work, and append one line to `docs/sprint/LOG.md`. Never edit another lane's
paths or the frozen contracts; write contract requests to `docs/sprint/CONTRACT-REQUESTS.md` and adapt locally. No
real sends and no secrets: every external service sits behind an interface with a fake, and code fails closed when a
secret is missing. Deliver in the priority order given so that partial completion is still useful. Work for up to ten
hours or until done, then write `docs/sprint/reports/lane-<X>.md` (what shipped, how to run it, test counts, known
gaps, exactly where to resume) and stop. You may use sub-agents for parallel work inside your own paths.
