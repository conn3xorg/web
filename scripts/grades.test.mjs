// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { BANDS, HELD, PASS_MARK, RUBRIC, badge, behaviourLine, blocked, evaluate, gradeOf, keyExpiry, latestTag, parseWorkflow } from "../apps/site/src/lib/grades.js";
import { unavailable } from "../apps/site/src/lib/builder.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const published = JSON.parse(read("apps/site/src/data/grades.json"));

const ci = (after, matrix = "[rocky10, fedora45, ubuntu2404, debian13]") => `name: CI
jobs:
  e2e:
    runs-on: ubuntu-24.04
    strategy:
      matrix:
        distro: ${matrix}
    steps:
      - uses: actions/checkout@abc # comment
      - name: Apply, then plan again with no changes
        run: |
          conn3x init
          conn3x apply -auto-approve
          conn3x plan -detailed-exitcode
${after}
      - name: Show the logs
        if: failure()
        run: curl http://example.test/logs
`;

const evidence = (workflow, more = {}) => ({
  tag: "v1.0.0",
  tagVerified: true,
  tagDate: "2026-10-20T00:00:00Z",
  run: { conclusion: "success", date: "2026-10-30T00:00:00Z", url: "https://example.test/run" },
  rules: ["pull_request", "required_status_checks"],
  realHost: null,
  now: Date.parse("2026-11-01T00:00:00Z"),
  ...more,
  files: new Map([[".github/workflows/ci.yml", workflow], ["main.circuit.hcl", 'step "x" {\n  service {}\n}\n'], ...(more.files ?? [])]),
});
const check = (r, id) => r.checks.find((c) => c.id === id);
const fetching = "      - name: Fetch\n        run: sudo podman exec host curl -sSf localhost:80\n";

test("the workflow parser splits jobs and steps and drops comments", () => {
  const [job] = parseWorkflow(ci("# conn3x restart\n"));
  assert.equal(job.name, "e2e");
  assert.equal(job.steps.length, 3);
  assert.equal(job.steps[1].name, "Apply, then plan again with no changes");
  assert.ok(!job.steps.flatMap((s) => s.lines).join().includes("restart"));
});

test("looking at a host isn't using it", () => {
  for (const l of ["sudo podman exec x systemctl is-active nginx", "sudo podman exec -w /opt/x host docker compose ps --status running", "k3s kubectl wait --for=condition=Ready node", "tailscale version", "sh -eu <<'EOF'", "sudo podman exec x sysctl -n net.ipv4.ip_forward | grep -qx 1", "grep -q x /etc/y", "&check |"]) {
    assert.equal(behaviourLine([l]), null, l);
  }
  for (const l of ["sudo podman exec x curl -sSf localhost", "psql -h 127.0.0.1 -c 'SELECT 1'", 'out=$(curl -sSf localhost)']) assert.ok(behaviourLine([l]), l);
});

test("a function is judged by what it runs, and an assignment by what it calls", () => {
  assert.equal(behaviourLine(["ok() { systemctl is-active x; }", "ok"]), null);
  assert.equal(behaviourLine(["ok() {", "  systemctl is-active x", "}", "ok"]), null);
  assert.equal(behaviourLine(["ip=$(sudo podman inspect -f '{{.NetworkSettings.IPAddress}}' x)"]), null);
  assert.match(behaviourLine(["fetch() { curl -fsS http://x/; }", "fetch"]), /^curl/);
});

test("a step's name earns nothing, and failure-only steps don't count", () => {
  const r = evaluate(evidence(ci("      - name: Curl the page and restart it\n        run: systemctl is-active x\n")));
  assert.equal(check(r, "behaviour").state, "fail");
  assert.equal(check(r, "restart").state, "fail");
});

test("a script a step calls counts as what the step does", () => {
  const r = evaluate(evidence(ci("      - name: Check\n        run: test/check.sh\n"), { files: [["test/check.sh", "#!/bin/sh\n# curl in a comment\ncurl -sSf localhost\n"]] }));
  assert.equal(check(r, "behaviour").state, "pass");
  const comment = evaluate(evidence(ci("      - name: Check\n        run: test/check.sh\n"), { files: [["test/check.sh", "#!/bin/sh\n# curl in a comment\n"]] }));
  assert.equal(check(comment, "behaviour").state, "fail");
});

test("the second plan has to be able to fail", () => {
  const soft = ci("").replace("-detailed-exitcode", "-detailed-exitcode || true");
  assert.equal(check(evaluate(evidence(soft)), "second-plan").state, "fail");
  assert.equal(check(evaluate(evidence(ci(""))), "second-plan").state, "pass");
});

test("a circuit that never applies fails, and can't pass on points", () => {
  const r = evaluate(evidence("jobs:\n  validate:\n    steps:\n      - run: conn3x validate\n"));
  assert.equal(check(r, "matrix").state, "fail");
  assert.equal(r.grade, "F");
  assert.equal(r.passing, false);
});

test("the matrix earns a quarter per distribution", () => {
  assert.equal(check(evaluate(evidence(ci(fetching))), "matrix").points, 10);
  assert.equal(check(evaluate(evidence(ci(fetching, "[ubuntu2404, debian13]"))), "matrix").points, 5);
});

test("secrets in state only matter where there are secrets", () => {
  const secret = ["variables.tf", 'variable "p" {\n  sensitive = true\n}\n'];
  assert.equal(check(evaluate(evidence(ci(fetching))), "secrets-in-state").state, "na");
  assert.equal(check(evaluate(evidence(ci(fetching), { files: [secret] })), "secrets-in-state").state, "fail");
  const asserted = ci(`${fetching}      - name: State\n        run: "! grep -q hunter2 terraform.tfstate"\n`);
  assert.equal(check(evaluate(evidence(asserted, { files: [secret] })), "secrets-in-state").state, "pass");
});

test("real API evidence decides the repository checks", () => {
  const bad = evaluate(evidence(ci(fetching), { tagVerified: false, rules: ["deletion"], run: { conclusion: "failure", date: "2026-10-30T00:00:00Z", previous: "failure" }, tagDate: "2025-01-01T00:00:00Z" }));
  for (const id of ["signed-tags", "branch-protection", "ci-green", "fresh"]) assert.equal(check(bad, id).state, "fail", id);
  assert.equal(bad.passing, false, "red CI is a gate");
  assert.equal(check(evaluate(evidence(ci(fetching), { run: undefined })), "ci-green").state, "fail");
});

test("one failed CI run doesn't drop a circuit, and staying red does", () => {
  const graded = (run) => evaluate(evidence(ci(fetching), { run: { date: "2026-10-30T00:00:00Z", ...run } }));
  const green = (run) => check(graded(run), "ci-green").state;
  assert.equal(green({ conclusion: "failure", attempt: 1, previous: "success" }), "pass", "one failure");
  assert.equal(green({ conclusion: "failure", attempt: 1 }), "pass", "the only run, not re-run");
  assert.equal(green({ conclusion: "success", attempt: 1, previous: "failure" }), "pass", "a failure, then a pass");
  for (const run of [{ conclusion: "failure", attempt: 1, previous: "failure" }, { conclusion: "failure", attempt: 2 }]) {
    assert.equal(green(run), "fail", JSON.stringify(run));
    assert.ok(graded(run).gateFailed.includes("ci-green"));
    assert.equal(graded(run).passing, false);
  }
  assert.ok(!graded({ conclusion: "failure", attempt: 1, previous: "success" }).gateFailed?.includes("ci-green"));
});

test("a failed re-run is red whatever came before, and a lone failure gets 3 days", () => {
  const green = (run) => check(evaluate(evidence(ci(fetching), { run })), "ci-green").state;
  const lone = { conclusion: "failure", attempt: 1, previous: "success" };
  assert.equal(green({ ...lone, date: "2026-10-30T00:00:00Z", attempt: 2 }), "fail", "re-run failed, previous passed, recent");
  assert.equal(green({ ...lone, date: "2026-10-29T00:00:00Z" }), "pass", "exactly 3 days old");
  assert.equal(green({ ...lone, date: "2026-10-28T23:59:59Z" }), "fail", "just over 3 days old");
  const { previous, ...only } = lone;
  assert.equal(green({ ...only, date: "2026-10-29T00:00:00Z" }), "pass", "the only run, exactly 3 days old");
  assert.equal(green({ ...only, date: "2026-10-28T23:59:59Z" }), "fail", "the only run, just over 3 days old");
  assert.equal(green({ ...lone, conclusion: "success", date: "2026-01-01T00:00:00Z" }), "pass", "an old pass stays a pass");
});

test("downloads need a checksum, with interpolation in the block", () => {
  const hcl = (body) => ({ files: [["main.circuit.hcl", `step "d" {\n  download {\n    url = "https://x/\${var.v}"\n${body}  }\n}\n`]] });
  assert.equal(check(evaluate(evidence(ci(fetching), hcl("    sha256 = var.s\n"))), "downloads").state, "pass");
  assert.equal(check(evaluate(evidence(ci(fetching), hcl(""))), "downloads").state, "fail");
});

test("held checks publish nothing and score nothing", () => {
  const leaky = evidence(ci(fetching), { files: [["main.circuit.hcl", 'x = "docker.io/a/b:1"\ny = "0.0.0.0"\n']] });
  const held = new Set(["images-by-digest", "listen-address"]);
  const heldResult = evaluate(leaky, { held });
  const open = evaluate(leaky, { held: new Set() });
  assert.equal(check(open, "images-by-digest").state, "fail", "the check does run when released");
  for (const id of held) {
    const c = check(heldResult, id);
    assert.deepEqual(Object.keys(c).sort(), ["id", "max", "points", "state"]);
    assert.equal(c.state, "held");
  }
  assert.ok(heldResult.score > open.score, "held failures don't lower the score");
});

test("an address in prose or a comparison isn't a listener", () => {
  const state = (file, text) => check(evaluate(evidence(ci(fetching), { files: [[file, text]] })), "listen-address").state;
  for (const safe of [
    'description = "\\"0.0.0.0\\" listens on every address."',
    'error_message = "such as \\"0.0.0.0\\""',
    'h = lookup({ "0.0.0.0" = "127.0.0.1" }, var.a, var.a)',
    'h = contains(["0.0.0.0"], var.a) ? "x" : "y"',
    'h = var.a == "0.0.0.0" ? "x" : "y"',
    'default = "127.0.0.1"',
  ]) assert.equal(state("variables.tf", `${safe}\n`), "pass", safe);
  for (const open of ['default = "0.0.0.0"', 'default = ["0.0.0.0"]', 'default = "::"', 'default = "[::]"', 'default = "0.0.0.0:3000"', 'bind = "0.0.0.0"', 'ExecStart=/x --web.listen-address=:9100']) {
    assert.equal(state("main.circuit.hcl", `${open}\n`), "fail", open);
  }
});

test("an image is judged where it's pulled, not where it's named", () => {
  const state = (text) => check(evaluate(evidence(ci(fetching), { files: [["main.circuit.hcl", `${text}\n`]] })), "images-by-digest").state;
  assert.equal(state('image = "docker.io/a/b:${var.v}"'), "fail");
  assert.equal(state('image = "docker.io/a/b:${var.v}@${var.d}"'), "pass");
  assert.equal(state('value = "docker.io/a/b:${var.v}"'), "na", "an output");
  assert.equal(state('error_message = "such as \\"docker.io/a/b:1\\""'), "na", "an error message");
});

test("privileged shell patterns fail by name, and clean shell passes", () => {
  const graded = (text) => check(evaluate(evidence(ci(fetching), { files: [["main.circuit.hcl", `${text}\n`]] })), "privileged-shell");
  for (const [bad, why] of [
    ["curl -fsSL https://x/i.sh | sudo bash", "pipes a download"],
    ['tool change-password --password "$p"', "command line"],
    ["chmod 777 /srv/x", "writable by everyone"],
    ["chmod -R o+w /srv/x", "writable by everyone"],
    ["render > /tmp/app.conf", "/tmp"],
    ["tool --allow-root", "refuses root"],
    ["wget --no-check-certificate https://x/y", "without checking"],
    ["printf x | curl -sfk -K- -o /dev/null https://127.0.0.1:1/", "certificate check off, without checking who holds the port"],
    ['curl -k -H "Authorization: Bearer $t" https://127.0.0.1:1/', "certificate check off"],
    ["curl --insecure -u a:b https://x/", "certificate check off"],
    ["cat /proc/net/tcp; printf x | curl -sSfk -K - https://127.0.0.1:1/", "after checking who holds the port"],
  ]) {
    const c = graded(bad);
    assert.equal(c.state, "fail", bad);
    assert.ok(c.detail.includes(why), bad);
  }
  for (const good of [
    "curl -fsS https://x/i.sh -o i.sh",
    "printf '%s' \"$p\" | tool --password-stdin",
    "chmod 750 /srv/x",
    'w=$(mktemp -d); render > "$w/new"',
    'Exec=-c "sed s/a/b/ s.sh > /tmp/s.sh && exec bash /tmp/s.sh"',
    'description = "Never run curl x | sh here."',
    "curl -sk -o /dev/null https://127.0.0.1:1/",
    "printf x | curl -sf -K- https://127.0.0.1:1/",
    'curl -sf -o /dev/null --cacert ca.pem --cert a.pem --key k.pem https://127.0.0.1:1/',
  ]) assert.equal(graded(good).state, "pass", good);
});

test("nothing held reaches the published file, and every check is there", () => {
  for (const [name, g] of Object.entries(published)) {
    assert.deepEqual(g.checks.map((c) => c.id), RUBRIC.map((r) => r.id), name);
    for (const c of g.checks) if (HELD.has(c.id)) assert.deepEqual([c.state, c.detail], ["held", undefined], `${name} ${c.id}`);
  }
});

test("the directory's circuits have grades, and nothing else does", () => {
  const names = readdirSync(new URL("../apps/site/src/data/circuits/", import.meta.url)).map((f) => f.replace(".json", ""));
  assert.deepEqual(Object.keys(published).sort(), [...names].sort());
  for (const name of names) {
    assert.ok(published[name], name);
    assert.match(published[name].checkedAt, /^\d{4}-\d{2}-\d{2}T/);
  }
});

test("grades turn on the bands, and a gate overrides the score", () => {
  const c = (points, max, extra = {}) => ({ id: "x", state: "pass", points, max, ...extra });
  assert.equal(gradeOf([c(90, 100)]).grade, "A");
  assert.equal(gradeOf([c(69, 100)]).grade, "D");
  assert.equal(gradeOf([c(69, 100)]).passing, false);
  assert.equal(gradeOf([c(PASS_MARK, 100)]).passing, true);
  assert.equal(gradeOf([c(99, 100), c(0, 1, { gate: true, state: "fail", id: "g" })]).grade, "F");
  assert.equal(gradeOf([c(50, 100), { id: "n", state: "na", points: 0, max: 50 }]).score, 50 * 2 / 2, "na leaves the total");
  assert.equal(BANDS.at(-1)[0], "F");
});

test("the latest tag is the highest version, not the last listed", () => {
  assert.equal(latestTag(["v0.1.9", "v0.1.10", "v0.2.0-rc1", "nightly"]), "v0.1.10");
  assert.equal(latestTag(["nightly"]), undefined);
});

test("key expiry reads a real pinned key", () => {
  assert.equal(keyExpiry("no key here"), undefined);
  // A v4 RSA stub: created 2020-01-01, self-signed with a one-year life.
  const created = Date.UTC(2020, 0, 1) / 1000;
  const key = Buffer.from([4, 0, 0, 0, 0, 1, 0, 1, 0, 1]);
  key.writeUInt32BE(created, 1);
  const sub = (type, v) => {
    const b = Buffer.alloc(6);
    b[0] = 5;
    b[1] = type;
    b.writeUInt32BE(v, 2);
    return b;
  };
  const hashed = Buffer.concat([sub(2, created), sub(9, 365 * 86400)]);
  const sig = Buffer.concat([Buffer.from([4, 0x13, 1, 8]), Buffer.from([0, hashed.length]), hashed, Buffer.from([0, 0])]);
  const packet = (tag, body) => Buffer.concat([Buffer.from([0xc0 | tag, body.length]), body]);
  const armor = (b) => `-----BEGIN PGP PUBLIC KEY BLOCK-----\n\n${b.toString("base64")}\n-----END PGP PUBLIC KEY BLOCK-----\n`;
  assert.equal(keyExpiry(armor(Buffer.concat([packet(6, key), packet(2, sig)]))), (created + 365 * 86400) * 1000);
  assert.equal(keyExpiry(armor(packet(6, key))), null, "no expiry is never");
});

test("the badge holds a letter and nothing else from a repo", () => {
  assert.match(badge("B"), /Conn3x grade: B\./);
  assert.match(badge("<script>"), /grade: none/);
  assert.ok(!badge("<script>").includes("<script"));
  assert.match(badge("A"), /not a security guarantee/);
});

test("enforcement off blocks nothing; on, it blocks what doesn't pass and what has no grade", () => {
  const all = { good: { grade: "B", passing: true }, bad: { grade: "F", passing: false } };
  assert.deepEqual(blocked(["good", "bad", "new"], all, false), {});
  const b = blocked(["good", "bad", "new"], all, true);
  assert.deepEqual(Object.keys(b), ["bad", "new"]);
  assert.match(b.bad, /grade of F/);
  const data = { circuits: { bad: { official: true, tested: ["x"] } }, inputs: { bad: { inputs: [] } }, builder: { excluded: {}, requires: {}, distros: [{ id: "x", name: "X" }] }, blocked: b };
  assert.match(unavailable(data, "bad", "x"), /grade of F/);
  assert.equal(unavailable({ ...data, blocked: {} }, "bad", "x"), null);
});

test("the rubric page matches the rubric, and says what a grade isn't", () => {
  const doc = read("apps/docs/src/content/docs/reference/circuit-grades.md");
  for (const r of RUBRIC) {
    const row = doc.split("\n").find((l) => l.startsWith(`| ${r.title} |`));
    assert.ok(row, `${r.title} is on the rubric page`);
    assert.match(row, new RegExp(`\\| ${r.group} \\| ${r.points} \\| ${r.gate ? "Yes" : " ?"} ?\\|`), r.id);
  }
  assert.match(doc, /not a security guarantee/);
  assert.match(doc, new RegExp(`C \\| ${PASS_MARK} to`));
});
