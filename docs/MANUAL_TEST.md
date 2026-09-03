# Manual test — 15 minutes, on a real phone

For a non-engineer. You need an Android or iPhone, the deployed URL, and (for
part C) a phone that has been added to the Meta test number's recipient list.

Write down anything that does not match. "It worked but felt slow" is worth
writing down too.

---

## Before you start

- URL: ______________________________________________
- Sign-in number: ____________________________________
- WhatsApp business number: __________________________
- Phone and browser: _________________________________

---

## A. First run (4 minutes)

| # | Do this | Expect |
|---|---|---|
| A1 | Open the URL | The sign-in screen, nothing else |
| A2 | Enter your number, tap **Send code** | A code arrives by SMS within ~30s (locally, use `123456`) |
| A3 | Enter the code | Either onboarding (new) or the entry screen (returning) |
| A4 | *New user:* business name → **Next** | Currency step, INR preselected |
| A5 | Choose currency → **Next** | Cash-in-hand step |
| A6 | Enter a starting amount → **Start recording** | The entry screen, **keypad already open**, cursor in the amount box |
| A7 | Time from A1 to A6 | **Under 60 seconds** |

Time taken: ______ seconds. Anything confusing? ____________________

## B. Daily use (6 minutes)

| # | Do this | Expect |
|---|---|---|
| B1 | Type `450`, tap a category, tap **Save** | The entry appears at the top; "Spent today" counts up; a short buzz |
| B2 | Count the taps from opening the app | Three or fewer for a repeat expense using a chip |
| B3 | Save the same amount and category again straight away | "Looks like a duplicate" — tap **Save anyway** |
| B4 | Tap the entry → **Delete** | It disappears; a toast with **Undo** and a draining bar |
| B5 | Tap **Undo** | The entry comes back |
| B6 | Delete again, wait 10 seconds | Gone for good; today's total drops |
| B7 | Tap **Add bill photo**, take a photo, save | Saves quickly even on a slow connection |
| B8 | Switch to **Income**, save `2000` from a customer name | Shows in green with a `+` |
| B9 | Tap the customer name | Their page, with paid/received totals |
| B10 | **Month** tab | Income, expense, net, and a bar per category |
| B11 | Swipe right on the month panel | Previous month |
| B12 | **Search**, type part of a note | Matches, grouped by date |

Amounts in Indian format (`₹1,23,456`)? Yes / No
Anything take longer than a second to respond? ____________________

## C. WhatsApp (3 minutes)

| # | Do this | Expect |
|---|---|---|
| C1 | Settings → WhatsApp → **Get a linking code** | A 6-character code |
| C2 | Send that code to the business number | One reply: "Linked…" |
| C3 | Send `450 tea shop` | **Exactly one** reply, starting "Saved: ₹450…" |
| C4 | Look at the app without reloading | The entry appears within ~3 seconds |
| C5 | Send `undo` | One reply confirming removal; the entry disappears |
| C6 | Send `paid 1200 rent bank` | Saved to Rent, account Bank |
| C7 | Send `got 5000 from ramesh` | Income 5000, party Ramesh |
| C8 | Send `asdf` | One reply with an example — and no entry |
| C9 | Send `today` | Three lines: count, in/out, net |
| C10 | Scroll the chat | **Never two replies to one message** |

Any message that got two replies? ____________________
Any message that should have worked but did not? Write it down exactly:
____________________________________________________________

## D. Offline and installing (2 minutes)

| # | Do this | Expect |
|---|---|---|
| D1 | Turn on aeroplane mode | The app keeps working; an offline mark appears |
| D2 | Save two entries | A pill: "2 entries waiting to sync" |
| D3 | Open the **Month** tab | Still readable |
| D4 | Turn aeroplane mode off | The pill disappears; both entries are there **once each** |
| D5 | Browser menu → Add to Home Screen | Installs as "Khata" with its own icon |
| D6 | Open from the home screen | No browser bar; opens on the entry screen |
| D7 | Android: long-press the icon | Shortcuts: Add expense, Add income, This month |

Duplicated entries after syncing? Yes / No — **if yes, stop and report it.**

---

## Verdict

Ready for a real shop? Yes / No

The three things most worth fixing:

1. ______________________________________________
2. ______________________________________________
3. ______________________________________________
