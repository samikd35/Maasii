Status: ready-for-agent

# Maasii v1: table service for Ethiopian cafés and restaurants

## Problem Statement

At an independent café or restaurant in Addis Ababa, a guest who wants to order has to catch a waiter's eye, read a paper menu that may have outdated prices, and ask how to pay by bank transfer or telebirr. Waiters take orders on paper and relay them from memory, so orders get lost, forgotten or attributed to the wrong table, and nobody knows how long a table has waited. The owner of a brand like Bilo's Pastry, with six venues, keeps separate menus up to date by hand, cannot tell which dishes guests love or have problems with, and has no record of service beyond the totals on the Official Receipts from the cash register. The few local QR-menu products show a menu but do not connect ordering, the waiter's work, payment and dish-level feedback into one picture an owner can act on.

## Solution

Maasii is one web app that serves guests, waiters, managers and owners.

A guest taps or scans the Venue Link on their table and gets a fast menu in Amharic or English in the venue's own branding. They build a Draft on their phone, choose their table at the first Send, and follow each Order as it is Sent, then Accepted by their waiter or Declined. Every phone at the table shares one Visit and one Bill. When the waiter prepares the Bill, the guest sees the dish prices, the total and the venue's Payment Options, and pays in their own bank or telebirr app or in cash. Maasii never handles money. After the waiter records the Payment Confirmation, the guest can leave a private Visit Review, a Dish Review for each dish the table ordered, and an optional Waiter Rating.

A waiter sees one list of their tables, sorted by what needs doing, and accepts Orders with one tap. They can drop sold-out dishes, decline fake Orders and move Orders that arrived at the wrong table, and they enter spoken orders with a quick-add screen. At payment they type the amount from the Official Receipt, and any Receipt Difference is flagged.

A manager runs Shifts and Table Assignments, sees exceptions first, and controls sold-out dishes, Bill corrections and end-of-day closing.

An owner edits the brand's Menu in draft, previews it, publishes it, and reads a weekly view of how each dish is ordered and reviewed, with one Weekly Finding to act on.

The first pilot venue is one Bilo's Pastry location, using Bilo's name, logo and colours. Any other brand can be set up through a small set of branding settings.

## User Stories

### Guest: opening and reading the menu

1. As a guest, I want to open the menu by tapping or scanning at my table, so that I can see what the venue offers without installing anything or creating an account.
2. As a guest, I want the menu to show the brand's logo, colour and cover photo, so that I trust it is the venue's official menu.
3. As a guest, I want to switch between Amharic and English from the header, so that I can read the menu in the language I prefer.
4. As a guest, I want my language choice to be remembered on my phone, so that I don't have to switch again on my next visit.
5. As a guest, I want sections (such as Breakfast, Sandwiches, Pastries, Cakes and Drinks) shown as a row of chips that jump to each section, so that I can find what I want quickly.
6. As a guest, I want each dish row to show its name, a short description and its price in ETB in a consistent position, so that I can scan and compare quickly.
7. As a guest, I want fasting dishes clearly labelled, so that I can choose food that fits my fast.
8. As a guest, I want the fasting section to appear first on fasting days, so that I don't have to hunt for it on a Wednesday, a Friday or during a fasting season.
9. As a guest, I want to see an optional "House favourite" card at the top, so that I notice what the venue is proud of.
10. As a guest, I want sold-out dishes hidden from the menu, so that I don't order something the venue cannot serve.
11. As a guest, I want the prices I see to be this venue's prices, so that the bill matches what I was shown.
12. As a guest, I want to open a dish to see its photo, a description of what arrives and what is included, so that I know what I'm ordering.
13. As a guest, I want the menu to open quickly on slow mobile data, so that I'm not waiting at the table.
14. As a guest, I want to browse the whole menu before saying which table I'm at, so that I can look without committing to anything.
15. As a guest, I want the menu to be readable and usable with large text, a screen reader or reduced motion, so that I can use it whatever my needs.

### Guest: building and sending an order

16. As a guest, I want to choose one option from a required "choose one" Option Group (such as bagel type or size) before adding a dish, so that the kitchen gets a complete order.
17. As a guest, I want to add extras from an "add extras" Option Group and see how each changes the price, so that I know what I'll pay.
18. As a guest, I want to add a short note to a dish, so that I can ask for small changes such as "no onion".
19. As a guest, I want to set the quantity of a dish, so that I can order for the whole party.
20. As a guest, I want my Draft docked at the bottom of the screen with the number of dishes and the running total, so that I always know what I'm about to send.
21. As a guest, I want to change or remove dishes in my Draft before sending, so that I can correct mistakes.
22. As a guest, I want my Draft kept on my phone if I refresh or lose signal, so that I don't have to rebuild it.
23. As a guest, I want to be asked which table I'm at the first time I send, using a grid of the venue's table numbers, so that my Order reaches the right waiter.
24. As a guest, I want my Table Choice remembered until my Visit closes, so that I'm not asked again for every Order.
25. As a guest, I want to change my Table Choice until my first Order is accepted, so that I can fix a mistake myself.
26. As a guest, I want to see "Sent" as soon as my Order reaches Maasii, so that I know it didn't disappear.
27. As a guest, I want to see "Accepted by Sam" when my waiter accepts my Order, so that I know a person has it.
28. As a guest, I want to see clearly if my Order was Declined, so that I can speak to a waiter.
29. As a guest, I want to see which dishes were dropped from my Order and why, such as "Sold out", so that I can choose something else.
30. As a guest, I want a failed send to say "Not sent - tap to retry", so that I know to try again.
31. As a guest, I want retrying a send never to create a duplicate Order, so that I'm not billed twice.
32. As a guest, I want ordering to be unavailable with a clear message when the venue has no Shift running, so that I don't send Orders nobody will see.

### Guest: sharing a table, the bill and payment

33. As a guest at a shared table, I want to see every Order my party has sent from any phone, so that we know what's coming.
34. As a guest at a shared table, I want my own Draft to stay private until I send it, so that I can decide in my own time.
35. As a guest, I want to see the shared Bill grow as Orders are accepted, so that we know what we owe.
36. As a guest, I want the Bill to show each dish's price and one total, labelled "Not a tax receipt", so that I understand it is not the Official Receipt.
37. As a guest, I want to see the venue's Payment Options when the Bill is prepared, so that I know how I can pay.
38. As a guest, I want each Payment Option to show the provider, the recipient name and a copyable account number or merchant code, so that I can pay from my banking or telebirr app without typing mistakes.
39. As a guest, I want to see the venue's payment QR image when one is provided, so that I can scan it from another phone or show it.
40. As a guest, I want a clear message telling me to ask my waiter if I try to order while our Bill is prepared, so that I know how to add something.

### Guest: reviews

41. As a guest, I want to be asked "How was your visit?" with Great, Okay or Needs work after payment is confirmed, so that I can share my overall experience.
42. As a guest, I want to answer "Would you order it again?" with Yes, Maybe or No for each dish my table ordered, so that the kitchen hears about specific dishes.
43. As a guest, I want optional topic chips (such as taste, portion, temperature, value, wait time) and an optional comment in my own language, so that I can explain briefly.
44. As a guest, I want to optionally rate the waiter who served us, so that good or poor service is noticed.
45. As a guest, I want to see "Shared privately with Bilo's" before I submit, so that I know my feedback is not public.
46. As a guest, I want to skip any review or submit only part of it, so that feedback never feels compulsory.
47. As a guest, I want the next scan after my Visit closes to start fresh, so that the next party never sees our Orders or Bill.

### Waiter: access and setup

48. As a waiter, I want to join my venue by scanning a join QR on my manager's phone, choosing my name and setting a 4-digit PIN, so that I can start without an email address or SMS code.
49. As a waiter, I want to stay signed in on my phone and unlock Maasii with my PIN, so that starting a shift is instant.
50. As a waiter, I want the staff screens in Amharic by default, with a switch to English, so that I can work in my own language.
51. As a waiter, I want dish names shown in both Amharic and English on my screens, so that I never confuse a dish.
52. As a waiter, I want to install Maasii to my home screen and receive notifications, so that I hear about new Orders even when my phone is locked.

### Waiter: running service

53. As a waiter, I want one "My tables" list sorted with new Orders first (oldest at the top, with a live timer), then Bills to settle, then tables in service, so that I always know what to do next.
54. As a waiter, I want each row to show a large table number and one main button such as Accept or Confirm payment, so that I can act with one tap.
55. As a waiter, I want a notification and a sound when an Order arrives at one of my tables, so that guests are not left waiting.
56. As a waiter, I want Orders that nobody accepts within about 2 minutes to reach every waiter on the Shift, so that no Order is forgotten.
57. As a waiter, I want to accept a whole Order with one tap, so that busy service stays fast.
58. As a waiter, I want to expand an Order and mark individual dishes as sold out while accepting the rest, so that guests get what is available and know what isn't.
59. As a waiter, I want marking a dish sold out during acceptance to hide it from my venue's menu straight away, so that other guests don't order it.
60. As a waiter, I want to decline an Order as a whole, such as when nobody is at the table, so that fake Orders never reach a Bill.
61. As a waiter, I want 5 seconds to undo an accept or decline, so that a mis-tap is harmless.
62. As a waiter, I want to move an Order to the correct table, so that a guest's wrong Table Choice is fixed without them reordering.
63. As a waiter, I want a quick-add screen with search, recent dishes and Option Groups, so that I can enter spoken orders into the same Visit and keep the Bill complete.
64. As a waiter, I want to correct mistakes on Orders I accepted until the Bill is prepared, so that the Bill is right.
65. As a waiter, I want to open a table to see its Orders, its Bill and its actions in one place, so that I can answer guests' questions.
66. As a waiter, I want to move a whole Visit to another free table when a party moves, so that their Orders and Bill follow them.
67. As a waiter, I want to see only my own tables, plus any Orders escalated to the whole Shift, so that my list stays focused.

### Waiter: bills and payment

68. As a waiter, I want to prepare the Bill when a guest asks for it, locking it, so that the amount doesn't change while they pay.
69. As a waiter, I want to reopen a prepared Bill when the same party wants more, so that I can add their new Order.
70. As a waiter, I want to confirm payment by choosing the method and typing the amount from the Official Receipt into an empty box, so that our record always matches the cash register.
71. As a waiter, I want to see the Receipt Difference after I type the amount and still be able to confirm, so that payment never blocks service.
72. As a waiter, I want a "Paid?" reminder when a Bill has been prepared for 20 minutes without a Payment Confirmation, so that I don't forget to record it.
73. As a waiter, I want a "New party at Table 08?" prompt when someone orders at a table whose Bill is prepared, with "Previous party paid" and "Same party" choices, so that a forgotten confirmation never blocks the next party.
74. As a waiter, I want Visits I take over at a Shift change to be labelled "Carried over from Sam", so that I know their history.

### Manager

75. As a manager, I want to sign in with my email or phone and a password, so that my account is secure.
76. As a manager, I want to add a waiter by showing a join QR, so that onboarding takes seconds.
77. As a manager, I want to remove a waiter and have them signed out everywhere immediately, so that former staff lose access.
78. As a manager, I want to save each waiter's Usual Tables, so that I don't assign tables from scratch every day.
79. As a manager, I want to start a Shift with one tap from a suggested assignment such as "Sam 1-8, Hana 9-16", so that service starts quickly.
80. As a manager, I want to move tables between waiters at any time, with earlier Orders keeping the original waiter's name, so that the record stays accurate.
81. As a manager, I want to end a Shift and have open Visits carried over to whoever takes those tables, so that nothing is lost between Shifts.
82. As a manager, I want an exceptions list first (Orders not accepted after 2 minutes, prepared Bills unconfirmed after 20 minutes, tables with no waiter, Receipt Differences), so that I see where help is needed now.
83. As a manager, I want the open tables shown as a list on my phone and as a room grid with status words on a tablet or laptop, so that I can see the floor on any device.
84. As a manager, I want to mark dishes sold out or available again for my venue instantly, so that the menu matches the kitchen.
85. As a manager, I want to remove any dish from a Bill or apply a discount to the whole Bill, always with a reason, so that I can handle complaints and corrections.
86. As a manager, I want every Bill change logged with who made it, when and why, so that I can review corrections later.
87. As a manager, I want to close a Visit without payment, choosing walked out, on the house or entered by mistake, so that the end-of-day record is complete and honest.
88. As a manager, I want an end-of-day closing list of every Visit still open, so that I can resolve them before the day ends.
89. As a manager, I want to see each day's Payment Confirmations and Receipt Differences, so that I can reconcile with the cash register.
90. As a manager, I want to see each waiter's Waiter Ratings once they have at least 10 responses, so that I can coach fairly without reacting to one or two opinions.
91. As a manager, I want to confirm payments myself, so that I can cover for a busy waiter.
92. As a manager, I want to manage my venue's tables and their numbers, so that the table grid guests see matches the room.

### Owner: brand, venues and staff

93. As an owner, I want to accept an invitation and set up my brand, so that I can start without a sales call.
94. As an owner, I want to set my logo, one brand colour, a cover photo and a display font from a curated list, so that the guest menu looks like my brand.
95. As an owner, I want Maasii to work out readable shades from my brand colour automatically, so that text and buttons are always legible.
96. As an owner, I want to create venues and invite a manager for each, so that every location can run its own service.
97. As an owner, I want to switch between my venues and have a manager's powers at any of them, so that I can step in anywhere.
98. As an owner, I want to download my venue's Venue Link and its QR image, so that I can have table cards made.
99. As an owner, I want to define each venue's Service Periods and service hours, so that insights compare like with like.
100. As an owner, I want to manage each venue's Payment Options (kind, provider, recipient name, account number or merchant code, optional QR image, display order), so that guests at every venue see the right details.
101. As an owner, I want every change to Payment Options logged, so that a wrong or tampered account number can be traced.

### Owner: menu

102. As an owner, I want to organise the Menu into sections and dishes, so that it mirrors how my guests think.
103. As an owner, I want to edit each dish's Amharic and English name and description side by side, so that both languages stay in step.
104. As an owner, I want to set a dish's base price, fasting label, house favourite flag and photo, so that the guest menu is complete.
105. As an owner, I want to attach "choose one" and "add extras" Option Groups to a dish, with an optional price change per choice, so that the Menu matches what we really sell.
106. As an owner, I want uploaded photos compressed automatically, so that the guest menu stays fast.
107. As an owner, I want my edits saved in a draft until I publish, so that guests never see half-finished changes.
108. As an owner, I want to preview the exact guest view of my draft, labelled Draft, before publishing, so that I can check language, prices and photos.
109. As an owner, I want to publish the draft in one step, so that all venues get the new Menu at once.
110. As an owner, I want to archive a dish without losing its history, so that past Orders and reviews still make sense.
111. As an owner, I want to set a venue's price for a dish that differs from the brand price, taking effect immediately, so that each location can price for its area.
112. As an owner, I want to photograph a paper menu and get its sections, dishes and prices as a draft, so that setup takes minutes instead of hours.
113. As an owner, I want Maasii to draft the missing Amharic or English text for me to review, so that a bilingual Menu is easy to maintain.

### Owner: insights

114. As an owner, I want my home screen to show the Live floor during service hours and the Weekly Finding outside them, so that I see what matters at that moment.
115. As an owner, I want to see accepted dish quantities by Service Period for each venue, so that I know what sells at breakfast, lunch and evening.
116. As an owner, I want to see each dish's "would order again" share and its most common topic chips, so that I know which dishes guests love or have problems with.
117. As an owner, I want to compare this week with last week for the same Service Periods, so that I can see whether things are improving.
118. As an owner, I want the number of responses shown next to every percentage, so that I don't over-read small samples.
119. As an owner, I want one Weekly Finding with links to the Orders and reviews behind it, so that I can check the evidence and decide what to change.
120. As an owner, I want to see the spread of Visit Reviews and the comments behind them, so that I understand the overall experience.

### Platform admin and the system

121. As the platform admin, I want to create a brand and invite its owner, so that I can onboard new clients.
122. As the platform admin, I want a read-only view of any brand's data, so that I can support owners without changing their records.
123. As the platform admin, I want to maintain the fasting calendar, so that fasting sections rise to the top on the right days every year.
124. As the platform admin, I want anonymous menu-open and dish-open events recorded from day one, so that "viewed but rarely ordered" analysis is possible later.
125. As the platform admin, I want personal data limited to staff names and phone numbers or emails, so that the move to hosting in Ethiopia stays manageable.

## Implementation Decisions

### Architecture

- One Next.js and TypeScript web app serves four areas: the guest menu, the staff area (waiters), the management area (managers and owners) and a platform admin area. Staff and management areas are installable as a progressive web app. See ADR 0001.
- Supabase hosted in Frankfurt provides Postgres, Auth, Realtime and Storage. Only features that also run on self-hosted Supabase are used, including scheduled jobs and storage. See ADR 0003.
- **Maasii core** is a single server-side module that owns every business rule. It exposes commands and queries, and every call is made as an explicit actor: a guest device, a waiter, a manager, an owner or the platform admin. Screens call the core through server actions or route handlers and contain no business rules. Each command runs in one database transaction. Concurrency-sensitive commands (accept, decline, move, prepare Bill, confirm payment, handle a new party) use conditional updates or row locks so that two waiters cannot both act on the same Order or Bill.
- Row-level security in Postgres also enforces who can read what. This protects live subscriptions, which read the database directly.

### Core commands and queries (the public interface)

- Menu: create, edit and archive sections, dishes and Option Groups in the draft; publish the draft; preview the draft; import a paper menu photo into the draft; draft missing translations; set a venue price; set or clear Sold Out for a venue.
- Brand and venue: update branding settings; create a venue; manage tables; manage Service Periods and service hours; manage Payment Options; get the Venue Link and its QR image.
- Staff: invite an owner or manager; create a join code; join with a code, name and PIN; unlock with a PIN; remove a staff member; set Usual Tables.
- Shifts: start a Shift with a Table Assignment; reassign a table; end a Shift.
- Guest service: get the published menu for a venue; choose or change a table; send an Order with a client-generated request identifier; get the guest's view of the current Visit; submit a Visit Review, Dish Reviews and a Waiter Rating.
- Waiter service: get the "My tables" list; accept an Order with optional Dropped Dishes; decline an Order; undo within 5 seconds; move an Order to another table; quick-add an Order; correct a line on one's own Accepted Order; move a Visit; prepare a Bill; reopen a Bill; confirm payment; resolve a new party ("Previous party paid" or "Same party").
- Management: get the exceptions list and the Live floor; adjust a Bill with a reason; close a Visit without payment with a reason; get the end-of-day closing list; get Payment Confirmations and Receipt Differences; get Waiter Ratings.
- Insights: get dish quantities and reviews by Service Period and week; get the Weekly Finding with its evidence.
- Events: record anonymous menu-open and dish-open events.

### Data model

- **Brand**: name, branding settings (logo, one brand colour, cover photo, display font from a curated list) and the currently published Menu version.
- **Venue**: belongs to a Brand; has a name, a Venue Link token, service hours and Service Periods. Times are stored in UTC and shown in Africa/Addis_Ababa time on a 24-hour clock.
- **Table**: belongs to a Venue; has a number label and an active flag.
- **Staff membership**: links a person to a role (Owner for a Brand, Manager or Waiter for a Venue), their Usual Tables (waiters) and an active flag. Removing a membership revokes all of that person's sessions.
- **Shift** and **Table Assignment**: a Shift belongs to a Venue, with start and end times. A Table Assignment links a table to a waiter for a time range within a Shift. Assignments are history and are never overwritten.
- **Menu**: sections, dishes and Option Groups are edited as a draft. Publishing creates an immutable Menu version, which guests read. A dish has a stable identifier across versions; archived dishes keep their history. An Option Group is either "choose one" (optionally required) or "add extras", and each choice has an optional price change.
- **Venue dish setting**: per Venue and dish, holds Sold Out and an optional price that differs from the brand price. Changes take effect immediately, without publishing.
- **Visit**: belongs to a Table at a Venue. Its state is open, bill prepared or closed. When closed, it records how: paid, walked out, on the house, or entered by mistake. A Visit is created by the first Order sent to a table with no open Visit. A Visit whose only Orders are all Declined ends automatically. A carried-over flag records a Shift change.
- **Order**: belongs to a Visit. Its source is a guest device or a waiter. It has a unique client request identifier, a state (sent, accepted or declined), who accepted or declined it and when, the waiter responsible at the time, and its history of moves. **Order lines** snapshot the dish name in both languages, the unit price, the chosen options and their prices, the quantity and the note at the moment of sending. A line can be marked as a Dropped Dish with a reason.
- **Bill adjustment**: a line removal, line correction or whole-Bill discount, with who made it, when and a reason.
- **Payment Confirmation**: belongs to a Visit. It records the method (cash or one of the venue's Payment Options), the amount typed from the Official Receipt, the Bill total at that moment, the Receipt Difference, who confirmed it and when.
- **Payment Option**: belongs to a Venue. It has a kind (bank transfer, mobile wallet or cash), provider, recipient name, account number or merchant code, an optional QR image, a display order and an active flag. Every change is written to a change log.
- **Visit Review**, **Dish Review** and **Waiter Rating**: belong to a closed Visit (a Dish Review also to a dish, a Waiter Rating also to the waiter who accepted most of the Visit's Orders). Each has a rating, optional topic chips, an optional comment and the language it was written in. None stores anything that identifies the guest.
- **Browsing event**: Venue, kind (menu opened or dish opened), dish if any, timestamp and a random identifier for that page load only, so events cannot link a guest across visits.
- **Audit log**: every staff command that changes an Order, Bill, Visit, Sold Out setting, Payment Option or staff membership.
- **Fasting calendar**: Wednesdays and Fridays by default, plus dated fasting seasons and exceptions maintained by the platform admin.

### Order and Visit rules

- An Order is Sent when the core has saved it, Accepted or Declined after a waiter acts, and can return to Sent only through the 5-second undo.
- Only Accepted Orders, minus Dropped Dishes and Bill adjustments, count towards the Bill.
- A repeated send with the same client request identifier returns the original Order and never creates a second one.
- Ordering is only possible while the Venue has a Shift running. Browsing is always possible.
- An Order goes to the waiter assigned to its table. If the table has no assigned waiter, or nobody accepts within 2 minutes, it goes to every waiter on the Shift and appears in the manager's exceptions.
- A guest device can change its Table Choice until its first Order is accepted. A waiter can move a single Order to another table at any time before the Bill is prepared, and the Order then follows the new table's Visit and waiter.
- Moving a Visit is only allowed to a table with no open Visit. Merging Visits is not supported.
- While a Visit's Bill is prepared, a device that has already sent an Order in that Visit is blocked from sending, with a message to ask the waiter. An Order from any other device reaches the waiter as "New party at Table N?". "Previous party paid" requires a Payment Confirmation for the old Visit, then starts a new Visit for the new Order. "Same party" reopens the Bill and adds the Order to the existing Visit.
- A prepared Bill without a Payment Confirmation for 20 minutes appears as "Paid?" for the waiter and in the manager's exceptions.
- Ending a Shift leaves Visits open and marks them carried over. The incoming Table Assignment decides who sees them.
- Waiters can correct only Orders they accepted, and only before the Bill is prepared. Managers and owners can adjust any Bill at any time before it closes. Every adjustment needs a reason.
- Confirming payment always requires the amount to be typed. The amount box is never pre-filled. See ADR 0006.
- Guests are anonymous and identified only by an anonymous device session. A device can read the open Visit at its chosen table. After the Visit closes it can still read that Visit's Bill and submit reviews, but nothing from any later Visit.

### Access and sign-in

- Owners and managers sign in with email or phone and a password through Supabase Auth.
- Waiters join with a short-lived join code shown as a QR by a manager, choose their name and set a 4-digit PIN. The device keeps a long-lived session, and the PIN unlocks it. PIN attempts are rate-limited. Removing a waiter revokes their sessions.
- Guest devices get an anonymous Supabase session on their first Send, which row-level security uses to scope what they can read.
- Platform admin is a separate role with full read access and the commands for creating brands, inviting owners and maintaining the fasting calendar.

### Live updates and notifications

- The guest's Visit view and the waiter's "My tables" list update live through Supabase Realtime, scoped by row-level security. If the live connection drops, they fall back to checking every 10 seconds.
- Waiters receive web push notifications through a service worker, with a sound when the app is open. Android is the supported staff platform. iPhones receive notifications only when Maasii is installed to the home screen.
- A scheduled job runs every minute. It escalates Orders unaccepted after 2 minutes and raises "Paid?" reminders after 20 minutes, sending the matching notifications.

### Guest experience and design

- The design direction is "The Order Slip", built on Paper & Ink: warm paper background, dark ink text, one brand accent, a price column aligned to the right, and at most one house favourite photo above the fold. The reference mockups live in the design boards folder.
- There is one screen: a compact header (logo, table number once chosen, an Amharic/English switch), section chips, dish rows, and the docked slip. The slip expands into a "Your table" sheet containing, in order: the Draft, the sent Orders with their status, the Bill and Payment Options once prepared, and the reviews once the Visit closes. There is no tab bar.
- The signature moment: on Send, the slip is stamped "Sent to Sam", then "Accepted ✓ Sam". With reduced motion enabled, the stamp appears without animation.
- On fasting days, from the fasting calendar, the fasting section moves to the top.
- A dish opens in a bottom sheet with the photo, description, fasting label, Option Groups, note, quantity and "Add to order".
- Performance budget: the guest menu is server-rendered and under about 150 KB before photos, photos are lazy-loaded and compressed, and the Draft is kept in the phone's local storage.
- Branding settings produce theme tokens. Colours are derived in a perceptual colour space so that text and button colours reach at least 4.5:1 contrast against their backgrounds. For example, Bilo's orange #EC6728 (about 3.2:1 on white) becomes a deeper #B4461A (about 5.5:1) for text and buttons, while the original orange stays available for decoration.
- The curated display fonts include Ethiopic faces such as Noto Serif Ethiopic and Noto Sans Ethiopic. The brand's logo is shown as an image.
- Touch targets are at least 44 by 44 pixels, every status colour has a word beside it, and every state change is announced in text.

### Staff and management experience

- Staff screens default to Amharic, with English available. All user-facing text is translated through next-intl, and dish content comes from the bilingual Menu.
- The waiter's "My tables" list is grouped and sorted in this order: new Orders (oldest first), "New party?" prompts, "Paid?" reminders and Bills to settle, then tables in service. Each row has one main button.
- The management Live floor shows the exceptions first, then open tables: a list on phones and a room grid with status words on wider screens.
- The menu editor shows the draft form and the guest preview side by side on wide screens, and Edit and Preview tabs on phones. Sold Out switches and venue prices are inline and immediate.
- The owner's home screen shows the Live floor during the venue's service hours and the Weekly Finding outside them.

### Insights

- All counts, percentages and comparisons are computed in the database or application code, never by AI.
- Dish quantities come from Accepted Orders minus Dropped Dishes, grouped by the venue's Service Periods and by week, always shown with their counts.
- The Weekly Finding is chosen by ordered rules with minimum sample sizes. (1) A dish with at least 5 Dish Reviews where one topic chip appears in at least 25% of them. (2) The largest week-over-week drop in accepted quantity for a dish within a Service Period, from a base of at least 10. (3) A rise in the share of "Needs work" Visit Reviews, from at least 10 reviews. When no rule qualifies, the finding says there isn't enough data yet and shows the counts. Each finding links to the Orders and reviews behind it. The thresholds are configuration values.
- Waiter Ratings are shown only to managers and owners, and only once a waiter has at least 10.

### AI helpers

- Menu photo import and translation drafts send only Menu content, never personal data, to an external AI model. Their output always lands in the draft for the owner to review. Nothing an AI produces is ever published automatically.
- AI summaries of guest comments are not part of v1.

## Testing Decisions

- Good tests exercise external behaviour only. They call Maasii core commands as a specific actor and assert on what that actor, or another actor, can then see through core queries. They never assert on table layouts, internal function calls or private helpers, so that the inside of the core can be refactored freely.
- **Seam 1: Maasii core.** This is the primary seam, and almost all tests live here. Tests run against a real local Supabase stack (Postgres with the real migrations and row-level security), not mocks. Each test builds a small scenario, such as a Bilo's brand with one venue, tables 1-16, waiters Sam and Hana, a running Shift and a published Menu. It then drives commands as guests and staff. The rules that must be covered here:
  - Sending, idempotent retries, Table Choice changes and the "no Shift running" block.
  - Routing to the assigned waiter, unassigned tables, and escalation after 2 minutes, with time controlled by the test.
  - Accepting, partial acceptance with Dropped Dishes and the immediate Sold Out effect, declining, undo, and two waiters racing to accept the same Order.
  - Moving Orders and Visits, and blocked moves to occupied tables.
  - Preparing and reopening Bills, the same-party block, and both answers to "New party at Table N?".
  - Payment Confirmation with and without a Receipt Difference, "Paid?" reminders, closing without payment, carry-over at Shift end, and the end-of-day list.
  - Bill corrections by waiters (own Orders, before preparation only) and adjustments by managers, with audit entries.
  - Visibility rules: a guest sees only their table's current Visit, a later party never sees an earlier Visit, waiters see only their tables plus escalations, venues and brands cannot see each other, and Waiter Ratings stay hidden below 10.
  - Menu draft, preview and publish (guests never see the draft), venue prices, archived dishes keeping history, and Order lines keeping their snapshot after Menu changes.
  - Insights: quantities by Service Period, review shares with counts, and each Weekly Finding rule, including the "not enough data" case.
  - Branding: derived colours always meet 4.5:1 contrast for a range of input colours, including Bilo's orange.
- **Seam 2: browser end-to-end.** A few Playwright tests cover behaviour that only exists in the interface:
  - A full happy path across two browser contexts (guest and waiter): browse, Draft, choose a table, send, waiter sees it live and accepts, guest sees "Accepted", waiter prepares the Bill, guest sees the Bill and Payment Options, waiter types the receipt amount, guest sees the review prompt and submits.
  - The Draft surviving a reload, and "Not sent - tap to retry" with the network offline, without creating a duplicate Order.
  - The language switch and the fasting-day ordering.
  - The guest menu weight staying within the performance budget.
- There is no prior art in this repository yet. These tests establish the patterns: one scenario-builder for core tests and one two-context pattern for end-to-end tests.

## Out of Scope

- "Call waiter" and "Ask for the bill" buttons.
- A kitchen screen, and the Preparing, Ready and Served statuses.
- Splitting a Bill, merging Visits and moving a Visit onto an occupied table.
- Takeaway, counter pickup, whole-cake and custom-cake pre-orders, and deposits.
- Any payment processing, payment status from banks or telebirr, and Chapa or telebirr integration. See ADR 0002.
- A VAT or service-charge breakdown on the Bill, and issuing any tax receipt.
- Anything physical: table card design, printing, NFC tag selection or writing.
- AI summaries or translations of guest comments, forecasting and demand prediction.
- A cashier role, reservations, inventory and stock tracking.
- Public reviews and links to Google reviews.
- Billing Maasii's clients inside the app. Clients are invoiced manually.
- Languages beyond Amharic and English. The Menu and interface are built so that more can be added later.
- Native mobile apps.
- Self-hosting in Ethiopia. Planned, but not part of v1. See ADR 0003.

## Further Notes

- **Pilot:** two weeks at one Bilo's Pastry venue (probably the Lancha headquarters), assuming waiters serve tables there. It succeeds if most of these hold: at least 40% of Orders come from guests' phones; waiters accept in under 1 minute on average from Send; every closed Visit has a Payment Confirmation with a typed receipt amount; at least 50 Dish Reviews per week; the manager acts on at least one Weekly Finding; and Bilo's agrees to keep using it, paid.
- **Bilo's brand assets** for the pilot are in the brand folder: the logo, a product photo, colours #EC6728, #EE4635 and #FDE8E8, and website fonts Red Hat Display, Roboto Slab and Roboto. Bilo's must confirm in writing that we may use its name, logo, photos and Menu.
- **Assumptions to confirm during the pilot:** Payment Options are set per venue; times use the standard 24-hour clock rather than the Ethiopian clock; staff use their own Android phones; a solo build aiming for a pilot in roughly 6-8 weeks.
- **Data protection:** before charging any venue, get local legal advice on Proclamation 1321/2024, Article 22, and whether staff names and phone numbers stored in Frankfurt are acceptable. If not, move to self-hosted Supabase in an Addis data centre. See ADR 0003.
- **Suggested build order**, matching the agreed priority of menu, then ordering, then insights:
  1. Brand, venue, branding and the published guest Menu, with the editor.
  2. Staff access, Shifts and Table Assignments.
  3. Sending and accepting Orders, with live updates and notifications.
  4. Bills, Payment Confirmation and the edge-case flows.
  5. Reviews.
  6. Insights and the Weekly Finding.
  7. AI menu import and translation drafts.
- Vocabulary follows the glossary, and decisions follow ADRs 0001-0006. Background research and the earlier design boards are in the research documents and the design boards folder at the project root.
