# Maasii staff workspaces audit and redesign

18 November 2026

**Verdict. Maasii has three different jobs behind an interface that treats almost everything like administration.** The Owner gets a Weekly Finding placeholder above their business. The Manager gets counts and links before the decisions those counts should drive. The Waiter gets a long stream where pressing **Accept** can fail with the explanation several screens away. These are failures of hierarchy, orientation and feedback. A visual refresh would leave the costly parts intact.

**Build the Waiter and Manager service loop first.** Make a waiting Order visible, give the Waiter a safe action, and let the Manager see which Table still needs help. Then build the Owner overview around accurately scoped Venue status and the Brand changes an Owner can make.

## Evidence and scope

I signed in as an Owner and a Manager and enrolled a Waiter through Maasii's QR flow on the local production build. The synthetic Brand had three Venues. Lancha had a running Shift, 16 Tables, five pending Orders across four Tables, an overdue Prepared Bill, a Receipt Difference and uncovered Tables. Bole was scheduled open with its Shift stopped. Kazanchis had a running Shift with zero assignments. I inspected Brand Menu, Branding, Dish insights, Payment Options, Venue setup, Live floor, Shifts, Venue Menu, Closing and payments, Table queue, Table detail, Quick-add and Menu reference. Core and UI source supplied the semantics behind the observations.

The main screen replay used Chromium at 390 × 844 and 1440 × 900, with a 320px Amharic reflow check and simulated 200% root text enlargement. I also replayed Manager sign-in and Live floor navigation on WebKit at 390px. The figures below describe the captured states. Real service speed, background push on an enrolled handset, screen-reader behavior and the quality of the Amharic copy still need field validation.

- [Owner overview · phone](evidence/owner-overview-390.png) and [Brand Menu editor · desktop](evidence/owner-brand-menu-desktop.png)
- [Manager operations · phone](evidence/manager-operations-390.png), [desktop](evidence/manager-operations-desktop.png), [Live floor · phone](evidence/manager-floor-390.png) and [Shift setup · phone](evidence/manager-start-shift-390.png)
- [Waiter queue](evidence/staff-queue-390.png), [partial acceptance](evidence/staff-partial-accept-390.png), [payment entry](evidence/staff-payment-390.png) and [Amharic at enlarged text size](evidence/staff-queue-am-enlarged-320.png)

P1 is a trust, accessibility or in-service workflow problem to fix before the redesigned flow ships. P2 is a recurring usability problem for the relevant workspace.

## Critique

### Across the workspaces

| Priority | Finding | Impact |
| --- | --- | --- |
| P1 | **The shell makes people reconstruct where they are.** Owner and Manager share “Maasii Manage.” The Venue subnavigation on a 390px phone took up three rows and 162px, with zero current-page markers. Live floor added a generic “Venue” back link and omitted Lancha from the title. Overview, Live floor and Closing all used the browser title “Manage · Maasii.” | Someone arriving from a link or switching between Venues has to infer which Venue and task a form affects. The first actionable information also starts lower on the screen. Give every screen a role, scope and selected section in the same place, plus a distinct page title. [Manage shell](../../src/app/manage/layout.tsx#L5) · [Venue navigation](../../src/app/manage/venues/%5BvenueId%5D/layout.tsx#L20) |
| P2 | **The desktop hierarchy is a stretched phone layout.** The Owner body was 672px wide and the Manager body jumped to 1,280px while the header stayed 672px. On Manager desktop an exception's action sat at the far edge of a 1,198px row. Near-identical controls appeared as bordered pills, plain links and underlined links across the flow. | Empty width separates the action from its Table. Padding and rounded containers signal grouping without telling the eye where to look. Use aligned columns and stable action treatments. [Desktop operations](evidence/manager-operations-desktop.png) · [Staff styles](../../src/app/staff.css#L16) |

### Owner

| Priority | Finding | Impact |
| --- | --- | --- |
| P1 | **“Venues in service” is an opening-hours count.** The fixture showed “1 Venues in service.” Its sole counted Venue was Bole, whose Shift was stopped. The two Venues with running Shifts had no configured hours and were omitted. | The Owner can form the wrong picture of a location's readiness. Display scheduled hours and live Shift/assignment state independently and show which Venue needs a check. [Overview](evidence/owner-overview-390.png) · [Service count query](../../src/core/weekly-finding.ts#L69) |
| P2 | **The first screen is dominated by a report that may have no finding.** At 390 × 844, the owner saw a Venue selector, “Show finding,” a week string, “View evidence,” “Set up service” and a second link to operations before reaching the Brand links at about y=742. The selector controls the finding alone, yet “Venue” gives it no local scope. “View evidence” opens sample counts even in the empty state. | The Owner lands on reporting controls before seeing the operational context or a specific next step. Surface Venues and the genuinely useful first action. Show the last completed week and evidence when there is a finding. [Overview](evidence/owner-overview-390.png) · [Finding and fallback actions](../../src/app/manage/owner-home.tsx#L48) |
| P2 | **Brand and Venue work are scattered.** Brand Menu and Branding are inline links inside each Brand section. Insights and Payment Options are reached through Venue setup. Branding places appearance, a guest preview and social links in one long form screen. The editor has helpful focused dish editing and draft recovery, but both the Brand and Venue editor use a generic “Publish” button. | An Owner trying to update one Venue can reach a similar-looking editor that can affect more Venues. Name the audience in the button with “Publish Brand Menu” or “Publish to Lancha.” Link directly to Venue Insights and Payment Options from the Venue context. [Owner links](../../src/app/manage/page.tsx#L48) · [Branding](../../src/app/manage/brands/%5BbrandId%5D/branding/page.tsx#L21) · [Publish controls](../../src/app/manage/brands/%5BbrandId%5D/menu/menu-editor.tsx#L351) |

### Manager

| Priority | Finding | Impact |
| --- | --- | --- |
| P1 | **The summary overstates readiness and understates risk.** A Shift with 0 assigned Waiters and 4 uncovered Tables said “Service is running.” Lancha had five pending Orders, four Tables awaiting acceptance, and a Prepared Bill outstanding for 27 minutes. The four-Table count was accurate, but the overdue Bill had no top-level signal and was buried below the Order exceptions. A deliberately failed live refresh left “Service is running” visible without a stale-state indication. | An open Shift, floor coverage and recent data are separate facts. Label them separately. Put the oldest unresolved tasks and their actionable links ahead of the navigation and make the last successful refresh visible. [Operations](evidence/manager-operations-390.png) · [Status and CTA conditions](../../src/app/manage/operations/page.tsx#L34) · [Refresh](../../src/app/manage/refresh-floor.tsx#L6) |
| P1 | **“Review pending Orders” takes you through a loop.** It opens a second rendering of the floor. “View Table” in that view scrolls to a summary tile on the same page. Selecting the tile opens Closing, where the pending-only Table displayed “Bill total: 0 ETB,” Bill adjustment and unpaid closure. The pending dishes were absent. | The Manager leaves the operational queue without seeing the Orders the initial action promised. Link straight to a Table's pending work and reserve the Closing link for the relevant Bill or receipt. [Floor screen](evidence/manager-floor-390.png) · [Exception and tile links](../../src/app/manage/live-floor.tsx#L11) · [Closing detail](../../src/app/manage/venues/%5BvenueId%5D/closing/page.tsx#L31) |
| P1 | **Starting or ending service is buried in a form for every Table.** The 12-Table start screen put Start Shift at y=1,385. It accepted the start with all 12 dropdowns set to Unassigned. A running Shift with 16 Tables put End Shift near y=2,889, below a separate Save assignment form for each Table. | The screen makes the Manager inspect every Table to act on the few that need attention, then starts a Shift where device alerts have no recipients until a Table is assigned. Show whether the Venue is ready, start with suggested coverage, focus the assignment list on uncovered Tables, and surface Shift controls beside the running state. [Start Shift](evidence/manager-start-shift-390.png) · [Shift forms](../../src/app/manage/venues/%5BvenueId%5D/shifts/page.tsx#L43) |
| P2 | **Live work and setup share the same screen.** Venue setup leads with Prepared Bills before Waiters, Venue Link and Tables. Closing leads with the full live Visit list before the date-scoped Payment Confirmations and presents Bill, Official Receipt and Receipt Difference as one dense sentence. The live Sold Out list gives managers a long menu to scan, while the publication editor has its own Dish search. | The person enrolling a phone works around a Bill panel. Someone investigating a Receipt Difference has to scan three amounts and establish which date they apply to. Give Closing two direct destinations, move Bills out of Venue setup, and make the live availability list directly searchable. [Venue setup](evidence/manager-venue-setup-390.png) · [Closing](evidence/manager-closing-390.png) · [Closing report](../../src/app/manage/venues/%5BvenueId%5D/closing/page.tsx#L102) · [Live Venue Menu](../../src/app/manage/venues/%5BvenueId%5D/menu/page.tsx#L39) |

### Staff / Waiter

| Priority | Finding | Impact |
| --- | --- | --- |
| P1 | **An Order failure disappears from the Waiter's point of attention.** After a simulated Accept failure at Table 16, the button became usable again and the error was 996px above the visible viewport. After a successful Accept on a later Order, Undo appeared 1,395px above the viewport with a five-second server window. | The person who tapped can easily miss both failure recovery and Undo. Put pending, failure, success and Undo at the affected Order, keep focus stable through refresh, and give an uncertain response its own state until it can be verified. [Viewport after failure](evidence/staff-order-failure-390.png) · [Decision handling](../../src/app/staff/my-tables.tsx#L85) · [Shared error and Undo placement](../../src/app/staff/my-tables.tsx#L159) |
| P1 | **A partial acceptance looks like full acceptance.** With Omelette marked Sold Out, the same “Accept” control sat above the changed selection, with no nearby summary. “New Order · 2” represented two lines, even though the Order contained five dishes. Move Order and Move Visit are similarly named disclosures in the same menu. | The confirmation point obscures what the guest will receive. Show explicit counts for dishes being accepted and dropped, and spell out the difference between moving this Order and moving the current Visit. [Partial acceptance](evidence/staff-partial-accept-390.png) · [Decision controls](../../src/app/staff/my-tables.tsx#L204) |
| P1 | **The Waiter has to read past the interface to reach the job.** A device setup warning, repeated titles, the Table heading, the waiting timer and an expanded Order preceded the first Accept at y=640. The fifth Accept was past y=2,000 and the Prepared Bill's “Confirm payment” appeared below y=2,330 in the captured queue. At 320px with enlarged Amharic text, the page measured 336px wide and the header's sign-out control reached past the right edge. | A service queue must give the first screen to service. Put connection health in a compact status line, show a dedicated waiting lane, and keep all assigned Tables reachable separately without scrolling past Orders. [Queue](evidence/staff-queue-390.png) · [Enlarged Amharic](evidence/staff-queue-am-enlarged-320.png) |
| P2 | **Payment is inserted into Order history.** Table 4 showed “Bill total: 220 ETB” twice and the question “Paid?” before the form. While the form was open, “Reopen bill” remained beside the active workflow and there was no explicit Cancel for receipt entry. A quiet Table's Quick-add starts only after entering its Table page. | The Waiter needs a distinct payment step anchored to the Table and Visit, plus a fast route to adding a Dish. The blank Official Receipt field, amount validation and visible difference deserve a clear place in this flow. [Payment entry](evidence/staff-payment-390.png) · [Bill controls](../../src/app/staff/bill-controls.tsx#L57) · [Quick-add entry](../../src/app/staff/my-tables.tsx#L149) |

## Proposed workspaces

Use the role and capability information already used for routing. Give the active Brand or Venue a stable place in the header, keep the chosen context during navigation, and show a selector when there is more than one authorized choice. Owners can enter management for a Venue from the overview. Reach Staff from the enrolled device as today. Use links for destinations with distinct URLs and retain existing deep links, including links from notifications and findings.

| Role | First useful screen | Primary navigation | A typical next action |
| --- | --- | --- | --- |
| Owner | Brand overview with a compact Venue status list, Brand Menu publication state, and the Weekly Finding when ready | Overview · Brand Menu · Venues · Insights · Brand settings | Open Lancha operations, review a finding, or finish a saved Brand Menu draft |
| Manager | Live floor of the selected Venue, beginning with urgent exceptions and coverage | Live floor · Shifts · Venue Menu · Closing · Venue setup | Open Table 2's pending Orders, assign an uncovered Table, or review an unconfirmed Bill |
| Waiter | Waiting Orders followed by a short set of active payment tasks | Queue · Tables · Menu | Accept an Order at Table 2, enter a receipt for Table 4, or add a Dish to Table 6 |

### Owner workflow

1. Put the selected Brand and Owner role above the fold. In **Venues**, show a row per Venue with Shift state, assignment coverage when a Shift is active, one high-priority issue where it exists, and a direct link to operations. When hours exist, show them as **Scheduled open** or **Outside scheduled hours**. Example rows for the fixture would read “Lancha · Shift running · 14/16 assigned” and “Bole · Scheduled open · No Shift.”
2. Turn the existing setup facts into a specific next step. With no Venues, show **Add Venue**. A Venue without Tables gets **Add Tables**. A Venue without staff gets **Invite a Manager** or **Connect a Waiter**, according to the action available. An unpublished Brand Menu gets **Publish the Brand Menu** with its own route. Treat completion as actual saved data and offer a direct action to fix the blocker. Give first-time Owners a way to check the actual guest page from Venue setup.
3. Put the Weekly Finding below immediate Venue and publishing work. Select the Venue inside the finding, label its week as a date range in Addis Ababa, and link to the exact Dish, Service Period or Visit evidence. With insufficient feedback, show “Collecting feedback for Lancha” and a link to Insights. In Insights, explain which comparison has little data, keep sample sizes beside rates, and put hours/Service Period settings behind a clear link. Keep data in readable rows with headers.
4. Use three sections in Brand settings for Appearance, Guest preview and Social links. Keep preview alongside appearance on desktop and reachable on the phone. In each Venue's detail, show Payment Options with active/inactive state and visible change history for Owners. A Manager's view should explicitly say “Managed by the Brand Owner” and show the currently usable options.

### Manager workflow

1. Open the authorized Venue's Live floor after sign-in when only one Venue is assigned. When several are assigned, show a compact Venue picker and restore the last authorized selection. On a healthy service the page leads with the floor. On a degraded service it leads with what needs attention. For a fresh snapshot, show **Shift running · 14/16 Tables assigned · Updated 10:32**. A zero-coverage Shift reads **Shift open · No Waiters assigned**. A stale snapshot keeps its last successful timestamp and offers **Refresh**.
2. Give **Needs attention** the first block. A row should read, for example, “Table 2 · 2 Orders waiting · oldest 7 min · Mekdes” with a direct task link. The current query can support **Tables with pending Orders** now. Add Order counts and dish details when the authorized read returns them. Keep the current escalation window for old Orders and the Prepared Bill reminder. Show Bill exceptions, uncovered Tables and Receipt Differences as distinct types so the Manager can filter directly. When a Table has both a pending Order and no Waiter, expose both on its detail and avoid making the Manager reconcile duplicate generic rows.
3. Give the floor a list on mobile and a scan-friendly grid alongside the attention list on wide screens. Show Table number, assignment, current Visit state and waiting age. The Table detail should show pending Orders and accepted running total as different values. The Manager can inspect and resolve work through currently authorized controls. Order acceptance stays in the Waiter workflow.
4. For Shifts, lead with status, coverage, and **Review assignments** or **Start Shift**. Put uncovered Tables first and prepopulate Usual Tables where available. Starting with zero assignments should explicitly state the service consequence and offer **Review assignments** before the operator commits. During service, show the number of uncovered Tables and target the selected Table directly. Keep per-Table saves for live reassignment so partial updates have visible outcomes. Put **End Shift** beside status with a consequence-specific confirmation naming the Venue and highlighting open Visits.
5. Break Closing into **Open Visits** and **Payment Confirmations** with distinct URLs or query state. Open Visits shows the live floor. Payment Confirmations uses a named date and Addis Ababa time. Put Bill, Official Receipt and signed Receipt Difference in aligned columns on desktop and labelled rows on a phone. Deep links from the floor should open the affected Visit or Payment Confirmation directly. Use an explicit reason and confirm the Table and consequence for unpaid closure. Put Waiter access, Venue Link and Table configuration in Venue setup. Treat enrollment as **Connect a new Waiter** and **Connect another phone** with a clear QR expiry and regenerate action.
6. Give the live Venue Menu a persistent **Find a dish** field and **Sold Out** filter. In each row, pair the state “Available” or “Sold Out” with the verb “Mark sold out” or “Restore availability.” Acknowledge the change at the row and explain that it applies immediately to this Venue. Put local price and content changes in **Edit Venue Menu**, with an inherited/overridden label and existing restore-to-Brand action.

### Waiter workflow

1. Make **Queue** the default with a compact Venue and Waiter header. Under it, show a short live status and the number of Orders waiting. Put the oldest actionable Table group first. Give each pending Order its own action and timestamp. Show ordered quantities, required Option Groups and guest notes alongside the relevant dish. Use the active language first, with the existing second-language name where it helps identify the Dish. Allow longer labels to wrap.
2. Keep payment reminders and routine open Visits below the waiting lane with direct links. Give **Tables** its own view of all assignments, with a number search, Visit status and one-tap access to the selected Table. When an unassigned Table sends an Order, show “Unassigned Table” in the queue and keep the current on-duty routing visible. Keep the searchable **Menu** reference separate.
3. On a Table, show the live Visit state once. At an empty Table, show “No open Visit” and **Add a Dish**. At an active Visit, show the accepted running total and **Prepare Bill** where applicable. At a Prepared Bill, show **Enter receipt** with the Table and Bill amount. Keep the amount field empty and labelled **Official Receipt amount (ETB)**, retain the method and any typed input after a recoverable failure, and show the signed difference before **Record payment**. Offer **Cancel** within receipt entry. Keep reopening as a separate decision, especially when a possible new party requires resolving the previous Bill first.
4. Use **Accept Order** for the routine action. When a dish is dropped, put “Accept 3 dishes · 2 Sold Out” or an equivalent localized summary beside the submit action. Separate **Decline Order**, **Move this Order** and **Move the Visit** with the object and destination Table visible before submission. Show the result beside the row and keep the five-second Undo reachable at the same position. For simultaneous actions on two devices, refresh the authoritative Order and say who already handled it when that data is available.
5. Give the queue clear loading, quiet, no Shift, no assignments and stale-data states. Keep the existing distinct empty messages and last-known Orders. Reduce notification setup to a compact **Device alerts** control until staff need its instructions. Place **Lock** at the end of the header, next to **Account**, which contains language and Sign out. Keep PIN unlock and QR re-enrollment separate from shift readiness.

### The same visual language across all three

Carry over the redesigned guest Menu's visible search, selected category treatment and legible prices for the staff Menu tools. The floor and queue should use compact rows organized around Table, assignment and service state. Keep the guest preview prominent when someone is editing the Menu or Branding.

- Use the existing warm Paper and Ink palette, the system Latin face and Noto Sans Ethiopic. Use 28–32px workspace headings, 18–20px section headings, and 16px body/control text. Give amounts and timers tabular figures. On 390px leave roughly 16–20px gutters, and use 8/16/24/32px spacing to group information. Use borders for grouping and active outlines where controls need a boundary. The current ink and muted text measure 13.98:1 and 5.08:1 on Paper. The hairline rule measures 1.24:1 on white, appropriate as a divider. Use the stronger control border when shape is the only indication a control exists. [Current theme](../../src/app/theme.css#L1) · [WCAG contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- Give state a written label and use restrained color on the row or badge. Candidate foreground/background pairs are **Waiting** #7C4200 on #FFF1D7, **Urgent** #942C25 on #FCEAE7 and **Live** #24593E on #E7F2E9. All three text pairs test above 6.8:1. Reserve the most prominent solid button for the next action within its object. Give destructive actions clear wording and place them apart from routine decisions.
- Align one shared management header and content grid. Use a left rail and content grid on wide screens and a compact, visibly selected navigation on phones. Keep three visible Waiter destinations. Mark links with `aria-current="page"`, add a skip link, and give each route a descriptive localized title. Name repeated actions with their Table or dish when needed. For phone controls use 48px service targets and at least 44px for other primary controls with room between them. WCAG 2.2 AA sets a 24 CSS px minimum with specified exceptions. The design targets allow more room for service use. [WCAG target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- Keep error messages next to their control and programmatically associate field errors. Announce important async outcomes in place. Use existing native dialogs for actions with significant consequences. Focus Cancel for destructive actions. On mobile, account for browser bars, the soft keyboard and safe areas before making actions sticky. Allow the page to reflow at 320px. Keep native table headers and explicit labelled values for review and receipt data. [WCAG status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) · [WCAG reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)

### Low-fidelity layouts

The first viewport should show who is working, where they are working and what they can do next. The examples below use illustrative fixture data.

```text
OWNER · JUNIPER CAFÉ                   Overview   Brand Menu   Venues   Insights
┌─ Venues ───────────────────────────────────────────────────────────────────────┐
│ Lancha       Shift running · 14/16 assigned · 4 tables waiting  Open operations │
│ Bole         Scheduled open · No Shift                      View setup          │
│ Kazanchis    Shift open · No Waiters assigned                Review coverage     │
└────────────────────────────────────────────────────────────────────────────────┘
  Brand Menu · Published 18 Nov                    Weekly Finding · 9–15 Nov
  Review saved draft                               Choose a Venue for this finding
```

```text
MANAGER · LANCHA                       WAITER · MEKDES / LANCHA
Floor | Shifts | Menu | Closing        Live · Updated 10:32
Shift running · 14 of 16 assigned
                                       5 Orders waiting
Needs attention                        Table 2 · waiting 7 min
Table 2 · 2 Orders waiting · 7 min     2 × Omelette · One without onions
[Open Table 2]                         3 × Macchiato · After food
Table 4 · Bill unconfirmed · 27 min    [Accept Order]   Order actions
[Open Bill]
Table 16 · No Waiter assigned         Payment needs attention
[Assign Table 16]                      Table 4 · Prepared Bill · 220 ETB
                                       [Enter receipt]
Floor · Table 1 · Table 2 · …          Queue | Tables | Menu
```

## Button placement and action hierarchy

### What is confusing now

| Current placement | What goes wrong |
| --- | --- |
| **Owner overview and editor.** On a 390 × 844 screen, **Show finding** appears at y=291 and **Add venue** begins at y=973. In the desktop editor, the draft state is at the left edge and **Save draft** and **Publish** sit together at the other end of a wide header. | A report filter takes precedence over adding a Venue. The author has to connect the draft state, publication scope and two neighboring commands before deciding what to press. [Owner overview](evidence/owner-overview-390.png) · [Editor](evidence/owner-brand-menu-desktop.png) |
| **Manager floor and Venue Menu.** **Review pending Orders** and **Live floor** link to the same destination. The Shift start and end controls sit after the assignment list. The availability switch displays **Available** while its accessible name says “Omelette Sold Out.” | The floor offers duplicate choices that seem to do different things. Shift controls read as the last field in a form. On the Venue Menu, the visible word describes the state while a tap performs a change, and the accessible name gives voice users a different label. [Operations](evidence/manager-operations-390.png) · [Shifts](evidence/manager-start-shift-390.png) · [Venue Menu](evidence/manager-menu-390.png) · [Switch source](../../src/app/manage/venues/%5BvenueId%5D/menu/sold-out-switch.tsx#L8) · [WCAG label in name](https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html) |
| **Waiter Order and payment.** **Accept** sits above the controls that change which dishes it accepts. In receipt entry, **Reopen bill** stays available above the fields while the actual submit is at the bottom. Table detail uses the Maasii wordmark to return to the queue and gives no dedicated back label. | The controls give more visual weight to the wrong step. A Waiter can miss the changed Order, reopen a Bill during receipt entry, or lose their place when returning to Tables. [Partial acceptance](evidence/staff-partial-accept-390.png) · [Receipt form](evidence/staff-payment-390.png) · [Table detail](../../src/app/staff/tables/%5BtableId%5D/page.tsx#L24) |

### Placement by task

| Screen | Put the frequent action here | Put secondary or consequential controls here |
| --- | --- | --- |
| **Owner overview and Venues** | Put **Add Venue** in the Venues section header. Make it the filled action in the empty state. Put **Open Lancha operations** on the Lancha row. On desktop, align it in a consistent action column. On phones, place it just below the Venue's status. | Keep **View evidence** and the Venue selector inside the Weekly Finding. **Brand Menu**, **Brand settings**, and **Insights** are navigation links in the workspace, away from form submit controls. |
| **Brand and Venue Menu editors** | While dirty, show **Unsaved edits** with **Save draft** in one group. Once saved, show **Draft saved · Guests still see the published Menu** and make **Review and publish** the main action in that same area. The final confirmation uses **Publish Brand Menu** or **Publish to Lancha** and explains where the changes will appear. | Keep **Edit** and **Preview** at the content switch. Place **Archive Dish**, **Restore Brand details** and section reorder in the affected Dish or Section. When all changes are published, the action area shows publication status. |
| **Brand settings and Payment Options** | Put **Save appearance** directly after the appearance fields. Keep the preview beside the form on desktop and let phone users open it from a clearly labelled control. Place **Save social links** below those links. Put **Add payment option** next to the options heading and **Save payment option** in the form it opens. | Keep row editing on the named account or link. Place **Deactivate** and **Remove** under the payment option's labelled **Actions** control. Show the account and Venue in a consequence-specific confirmation. |
| **Manager Live floor** | Use **Live floor** as the section destination. Put **Open Table 2**, **Assign Table 16**, or **Open Bill for Table 4** on the corresponding attention row. On desktop, keep each link within its row's content column. On phones, put it directly after the Table, state and age. | Put **Refresh** next to **Last updated**. Keep filters next to the list they affect. Setup lives in the Venue navigation and account controls live in the header. |
| **Manager Shifts and Venue setup** | Show **Review assignments** and the one filled **Start Shift** in a short setup panel above the assignment list. Put **Save assignment** beside the edited Table and **Connect a Waiter**, **Add Tables**, and **Copy Venue Link** in their respective setup sections. | Put **End Shift** under **Shift actions**, beside the running state. Keep it separate from assignment saves and show the Venue and any open Visits in the confirmation. Show **Regenerate QR** beside the enrollment QR and its expiry. |
| **Manager Venue Menu and Closing** | Put **Find a dish** above the availability list and **Mark sold out** or **Restore availability** on the affected Dish row. In Closing, put **Prepare Bill** or **Enter receipt** on the affected Visit. Keep the date selector and **Show date** in Payment Confirmations. | Put **Edit Venue Menu** near the page heading with a short scope label. Keep **Adjust Bill** and **Close unpaid** under the named Visit's **Bill actions**. Open unpaid closure with the Table number, consequence and required reason. |
| **Waiter queue and Tables** | Put **Accept Order** immediately below the Dish quantities, options and guest notes. Give it a full-width touch target on a phone. Keep the result and **Undo** in that same Order. Put **Add a Dish** beside the Visit state when the Waiter can add to that Table. | Put **Order actions** beside the main action on wide screens and just below it on phones. Reveal Sold Out options, **Move this Order**, **Move this Visit** where authorized, and **Decline Order** inside the same Order. Separate Decline visually. On detail screens place **Back to Queue** or **Back to Tables** above the Table heading, depending on the entry path. |
| **Waiter Add a Dish and receipt entry** | Keep the Table number above search and the selected Dish. Put **Add to Table 6** below the Dish fields. On a Prepared Bill, **Enter receipt** opens an entry panel with the Table, Bill amount, method, Official Receipt amount and signed difference. Put **Record payment** at the end of that panel. | Pair **Cancel** with **Record payment** at the form footer. Return to the same Bill and trigger after cancel. Keep **Reopen Bill** in **Bill actions** on the Table detail, outside the active receipt panel. Keep the new-party resolution choices together when they apply. |

### The same control should work the same way

- **Use one filled action per decision.** Next to a page heading, align it to the end of the heading row on desktop and place it below the scope on mobile. For a live list, each Order or Visit has its own action. Put that action directly beneath the information needed to act. Use outlined controls for secondary commands, text links for navigation, and text plus semantic color for status. Give opening and committing different verbs, such as **Enter receipt** and **Record payment**.
- **Keep the header and footer out of the way.** Put Back at the start of content and the scope in the same place across routes. Keep **Lock** and **Account** in the header. Use one compact editor action bar for draft and publish on a long phone form, with its own safe-area padding and space in the scroll container. Keep receipt submit in the form. Use in-flow actions where a sticky region would crowd the keyboard or enlarged text. Allow labels to wrap with their full 44px or 48px target, and leave at least 8px between adjacent targets. [WCAG focus visibility near sticky content](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)
- **Make a change visible where it happens.** For the sample Order, marking two Omelettes Sold Out produces “3 Macchiatos to accept · 2 Omelettes Sold Out” above **Accept 3 dishes**. Keep pending and failure messages in that same action area. Show **Accepting…** during submission, preserve the Order's location while staff act, and keep the recovery choice reachable after the response. Give repeated controls accessible names that start with their visible label and add the relevant Table or Dish.
- **Match confirmation to the consequence.** Keep ordinary Accept quick. Use a labelled confirmation for publication, ending a Shift, unpaid closure and removal of a Payment Option. Name the object and effect in the dialog. Put Cancel beside the exact confirmation verb and land focus on Cancel for destructive actions. Use a labelled disclosure in the row for extra commands. Keep routine action rows in normal Tab order.

### Phone wireframes for two critical decisions

```text
TABLE 2 · ORDER WAITING
2 × Omelette · One without onions
3 × Macchiato · After the food

3 dishes to accept · 2 Sold Out
[          Accept 3 dishes         ]
Order actions
```

```text
TABLE 4 · ENTER RECEIPT
Prepared Bill · 220 ETB

Method
[Cash                              ]
Official Receipt amount (ETB)
[219.75                            ]
Receipt Difference · −0.25 ETB

[Cancel]           [Record payment]
```

Check placements at 390 × 844 and 320px with enlarged Amharic text. A real acceptance error and Undo must be visible from the tap position on a later Order. A Manager must reach Shift controls before scrolling into individual assignments. Opening the receipt form must leave its method, amount and commit action reachable with the keyboard open. On desktop, verify that row actions line up with their own Table or Venue and that focus returns to the relevant trigger after a dialog or disclosure closes.

## Build sequence and acceptance

| Phase | Work | Evidence required to ship |
| --- | --- | --- |
| 1. Trust during service | Inline Waiter outcomes and reachable Undo, explicit partial acceptance, accurate Owner and Manager service labels, honest refresh status, and direct Manager links to pending work and Bills. | At the fourth Order, a simulated failure gives visible feedback beside Accept. An uncertain response is reconciled before a repeat action. A running Shift with zero assignments reads as uncovered. A failed refresh shows the last successful time. Selecting a pending-only Table opens pending work. A Bill link opens that Bill. |
| 2. Role navigation and service density | Apply the shared shell to existing routes. Make the Manager floor actionable above the fold. Give Waiters a dedicated Tables view and a Visit-centred payment flow. Split live Shift work and Closing from setup. | At 390 × 844 a Waiter can see and act on the first typical Order, including its note, from the first viewport. A quiet Table is reachable from Queue in two taps. A Manager can open the oldest pending Table in at most two actions and find Start Shift without scrolling through all 12 assignments. Returning through browser Back or the workspace links restores scope, filter and focus. A focused control stays visible next to sticky navigation. |
| 3. Owner and Menu work | Reorder Owner overview around Venues, the next setup task and the Weekly Finding. Add direct access to Insights and Payment Options. Make live Sold Out, Venue override and Brand publication scope explicit across editor and preview. | The Owner can identify which Venue needs work before opening Insights. A Manager can find and mark a known Dish Sold Out without entering the editor. A saved draft is visibly private. Each Publish action states where it will take effect. A Venue override survives an unrelated Brand update. |
| 4. Pilot and polish | Run bilingual rehearsal with an Owner, Managers and Waiters. Use a busy 16-Table fixture and the supported installed Android experience. Include keyboard, screen-reader, reflow, low-connectivity and race scenarios. | Measure first-attempt completion, time to first Accept, wrong Table/scope selections, and recovery after a failed mutation. Suggested pilot gates are at least 90% independent completion of core tasks and zero wrong-Table, wrong-Venue or wrong-publication-scope actions in observed critical flows. Ask bilingual staff to validate the operational wording and confirm real push delivery with the app backgrounded. |

Keep management pages server-rendered with the current App Router layouts. Reuse the existing form fields, status styles and editor. Scope new styles to the staff workspaces. Read Shift coverage at the existing authorized core boundary and keep live refresh, search and Order decisions in the interactive parts of the screens that need them.

Use existing browser scenarios for [floor](../../e2e/live-floor.spec.ts), [Shifts](../../e2e/shifts.spec.ts), [staff enrollment](../../e2e/staff-sign-in.spec.ts), [Orders and payments](../../e2e/orders.spec.ts), [Venue Menu](../../e2e/venue-menu.spec.ts) and [Insights](../../e2e/insights.spec.ts). Acceptance targets are proposals for the redesign. Compare before and after in the same fixture and sample real service separately. Include Android at 390px, WebKit as secondary coverage, 320px reflow, 200% text, phone landscape and 1,440px desktop. Exercise stale/offline recovery, shift handover, new-party payment, partial acceptance, late duplicate responses and concurrent decisions.

## Product rules to carry through

- Brand Menu defaults, Venue overrides and immediate Sold Out state have different guest consequences. Keep published menus, saved drafts, revision conflict recovery and Order history distinct. [Brand and Venue split](../../docs/adr/0005-brand-owns-the-menu-venue-owns-service.md) · [Venue publication](../../docs/adr/0007-managers-publish-venue-local-menu-changes.md)
- Assignments, an active Shift and browser notification permissions each communicate a different kind of readiness. Keep the existing authorization and fallback routing for Orders from unassigned Tables.
- The entered Official Receipt amount records what was paid outside Maasii. Keep it blank on entry, allow a genuine difference, and report the difference to Managers. Preserve the one Bill per Visit and the boundary between two parties using one Table. [Official Receipt decision](../../docs/adr/0006-official-receipt-amount-is-typed-in.md)
- Owner Insights use private feedback with supporting counts. Apply the existing visibility rules for Waiter ratings and other private reviews. Add a metric to a workspace when the role can interpret and act on it using authorized evidence.

### Modern Web Guidance

I used `navbar`, `responsive-table`, `dialog`, `forms`, `accessibility` and `form-factor-adaptation` to define navigation, receipt and insights layouts, confirmation, inline feedback and responsive checks for this design review. I used `toolbar` and `content-first-noise-reduction` to guide visible action groups, ordinary Tab order for form controls, compact fixed areas and disclosure for secondary commands. UI/UX Pro Max informed the touch spacing, status cues and scan-friendly layouts. The proposed typography and colors extend Maasii's existing paper, ink and Ethiopic typesetting.
