# Uptime Monitor: 6-week plan

A small service that checks a list of URLs on a schedule and records whether they're up. This file is a stand-in with the same shape as the real plan, used by the tests until the real one is added.

## Overview

| Week | Focus |
| --- | --- |
| 1 | Setup and first endpoints |
| 2 | Checks and storage |

Built in 90-minute sessions on weekdays.

## Pace and working rules

- One task per working day.
- If a day is lost, push the plan rather than double up.

## Keeping it at $0

Everything runs on free tiers. No paid add-ons.

## Week 1 (Oct 19 – 23): setup and first endpoints

- [ ] **Mon Oct 19:** Create the repo, the project skeleton and a README with the goal in one paragraph.
- [ ] **Tue Oct 20:** Add a health endpoint that returns `200 OK` and a version string.
  - Write one test for it.
  - Run it locally with curl.
- [ ] **Wed Oct 21:** Design the target model: URL, name, interval and the last result.
- [ ] **Thu Oct 22:** `POST /targets` to add a target, with validation of the URL and interval. Return the created target with its id so the client can list and delete it later.
- [ ] **Fri Oct 23:** `GET /targets` and `DELETE /targets/:id`.

**Checkpoint:** a recorded curl session showing a target added, listed, checked and deleted.

## Week 2 (Oct 26 – 30): checks and storage

- [ ] **Mon Oct 26:** Pick the storage and write the schema.
- [ ] **Tue Oct 27:** Save targets to storage instead of memory.
- [ ] **Wed Oct 28:** Write the checker: fetch a URL with a timeout and record status and latency.
- [ ] **Thu Oct 29:** Run the checker on each target's interval.
- [ ] **Fri Oct 30:** Store every check result with a timestamp.

**Checkpoint:** a target checked every minute for an hour, with 60 rows stored.

## Week 3 (Nov 2 – 6): history and status

- [ ] **Mon Nov 2:** `GET /targets/:id/checks` with paging.
- [ ] **Tue Nov 3:** Uptime percentage over 24 hours and 7 days.
- [ ] **Wed Nov 4:** Detect a target going down and coming back up.
- [ ] **Thu Nov 5:** Record incidents with start and end times.
- [ ] **Fri Nov 6:** `GET /status` summarising every target.

**Checkpoint:** an incident recorded by taking a test server down for five minutes.

## Week 4 (Nov 9 – 13): alerts

- [ ] **Mon Nov 9:** Choose the alert channel and send a test message.
- [ ] **Tue Nov 10:** Alert when a target goes down.
- [ ] **Wed Nov 11:** Alert when it recovers, with the downtime.
- [ ] **Thu Nov 12:** Don't alert again while an incident is open.
- [ ] **Fri Nov 13:** Settings per target: alerts on or off.

**Checkpoint:** a down and a recovery alert received on the phone.

## Week 5 (Nov 16 – 20): dashboard

- [ ] **Mon Nov 16:** A static page listing targets and their status.
- [ ] **Tue Nov 17:** A latency chart for one target.
- [ ] **Wed Nov 18:** Add and delete targets from the page.
- [ ] **Thu Nov 19:** Show open incidents at the top.
- [ ] **Fri Nov 20:** Make it usable on a phone.

**Checkpoint:** the dashboard open on a phone showing a live incident.

## Week 6 (Nov 23 – 27): deploy and write-up

- [ ] **Mon Nov 23:** Deploy the API on a free tier.
- [ ] **Tue Nov 24:** Deploy the dashboard.
- [ ] **Wed Nov 25:** Monitor the monitor: an external check on the health endpoint.
- [ ] **Thu Nov 26:** Write the README: setup, architecture and screenshots.
- [ ] **Fri Nov 27:** Record a two-minute demo.

## Buffer

The week after Nov 27 is spare, for anything that ran over.
