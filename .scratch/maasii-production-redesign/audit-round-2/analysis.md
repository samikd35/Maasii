# Maasii UI/UX audit, round 2 — 2026-11-17

## Verdict

The application is a functional MVP with a substantial visual refresh and useful workflow safeguards. It is not yet the complete, polished redesign described by the approved concept. Too many surfaces retain the old information structure inside newly rounded containers. The gap is especially clear in Menu authoring and staff workspaces.

My earlier implementation summary was too generous about design completion. Passing core/browser tests establishes the behaviours those tests assert; it does not establish that every page has a coherent hierarchy, visible feedback or an efficient workflow. This audit identifies implementation gaps beyond the previously recorded external/manual release gates.

Missing photographs, placeholder prices/content and image completeness are explicitly excluded at the user's request. None of the findings below depends on replacing them. No application source was changed during this audit.

## Method and limits

- Used the requested UI/UX Pro Max skill: accessibility, touch, navigation, hierarchy and product-pattern searches, the Next.js stack guidance and the full quick-reference checklist. Its generic restaurant landing-page recommendations were not treated as instructions to add advertising, animation or a delivery funnel to an in-Venue ordering app.
- Retrieved Modern Web Guidance `accessibility`, `form-factor-adaptation`, `dialog` and `forms`; read their complete outputs. Used current W3C sources to check accessibility claims.
- Inspected actual rendered Home, Menu, dish configuration, Draft, Table choice, sent status, More, Owner overview, operations, Venue setup, Brand editor and Waiter queue. Used 390×844 for the principal walkthrough, 320px Amharic and a 1440px editor check. Read the relevant production components to trace observed behaviour.
- Created an isolated local audit tenant through the existing scenario builder with a running Shift, 16 assigned Tables and the existing sample Menu. Sent and accepted a real local test Order. This did not modify the seeded Bilo Menu or any production tenant.
- Retained screenshots and [interaction observations](interaction-observations.log), plus [navigation measurements](navigation-measurements.log).
- This is a critical design and interaction review, not a new exhaustive security/backend audit, a screen-reader certification or a fluent Amharic review. Payment completion, all platform-admin states and every feedback failure state were not re-exercised in this round.

Severity: **P1** should be corrected before design acceptance; **P2** materially affects usability/polish and belongs in the same completion pass. These are priorities, not claims of data corruption.

## Findings

### F01 — P1: Editor errors are detached from the action that caused them

**Observed:** Uploading a malformed MP4 shows the error only in the page header. At the upload control, the error's bounding box starts at **y = −618px** with the page scrolled 867px. The field itself returns to “No file chosen,” with no nearby failure explanation. A sighted user can reasonably conclude that nothing happened.

**Evidence:** [Upload viewport](editor-hidden-error-390.png); `menu-editor.tsx` upload handlers at 224/243 and global error rendering at 369–372. An alert announcement helps some assistive-technology users but does not make this error visible beside the field.

**Fix:** Keep upload progress, validation/failure and Retry adjacent to the active dish's media controls. Link the error to its input. For global save/publish failures, keep the status/action area reachable and move attention appropriately. Preserve local edits.

**Acceptance:** From the media section on a 390px phone, an invalid upload produces a visible, actionable explanation without scrolling. Successful replacement is visibly confirmed and still requires Save/Publish.

### F02 — P1: The editor is still a long form, not a focused editing workspace

**Observed:** Opening the sample Omelette reveals **44 controls across 2,698px**. The first dish is already near the bottom of the initial mobile viewport. Section setup, import and Add section precede routine editing. Two language columns remain side by side on a phone. Save/Publish and the state summary scroll away because the sticky header is explicitly disabled below 600px.

**Evidence:** [Initial editor](editor-390.png), [expanded dish](editor-open-390.png), [desktop editor](editor-desktop.png); `menu-editor.tsx:385`, `:419`, `:628`; final media query in `staff.css`.

**Fix:** Lead with a compact searchable dish list that includes price and publication/override state. Open one focused dish workspace. Put name, price and serving media first; disclose Option Groups, ordering and archive actions separately. Adapt bilingual fields to the available width. Keep Save/state/Preview reachable on mobile without covering content or the keyboard.

**Acceptance:** A price change, media replacement and preview each have a short, obvious path. Users can save from the bottom of a complex dish without returning to the top of a multi-screen form. Do not solve this by shrinking fields.

### F03 — P1: The sent state makes correct accounting look incorrect

**Observed:** After sending a **240 ETB** dish, the sheet leads with **“Bill total 0 ETB”**, then “Sent” and the 240 ETB line. There is no nearby explanation that acceptance is pending and only accepted dishes count. The zero is a valid domain value; it is a poor primary message at this moment.

**Evidence:** [Immediately after Send](guest-sent-390.png); `order-service.tsx:249–260` renders the active Visit total before Order status even when there is no prepared Bill.

**Fix:** Before any acceptance, lead with “Sent to Table N — waiting for your Waiter” and the submitted amount. Explain the accepted-total rule. Once accepted, label the running total distinctly from a prepared Bill. Retain genuine partial acceptance and dropped-line information.

**Acceptance:** A first-time guest can distinguish sent value, accepted running total and prepared Bill without inferring how the accounting works.

### F04 — P1: The visible Choose control and its accessible name disagree

**Observed:** The visible orange label says “Choose,” but it is an `aria-hidden` span. The actual full-row button is labelled only by the dish name, such as “Omelette.” A voice user looking at “Choose” receives a different activation name.

**Evidence:** `guest-menu-parts.tsx:47`, `guest-menu-view.tsx` supplies only the name ID, and `ordering.tsx:49–53` consumes it. The browser identifies the button as “Omelette.”

**Fix:** Give the actual action a visible, associated label and an accessible name such as “Choose Omelette.” Keep a generous hit area and ensure both row and explicit control use the same required-choice flow.

**Acceptance:** Visible action text is contained in the accessible name, keyboard focus identifies the same action, and required choices remain enforced. [W3C Label in Name](https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html) explains why matching labels matters for speech input.

### F05 — P2: Navigation does not preserve the user's intent consistently

Three independently reproduced problems:

1. A Home card for Omelette opens the general Menu with **no dish detail**, forcing the guest to find and choose it again. All featured cards point to the same URL (`page.tsx:53`).
2. Opening **Your table** keeps **Menu** highlighted. The destination union omits `table`, and Menu always passes `current="menu"` (`guest-venue-page.tsx:10–21`).
3. Switching to Breakfast after scrolling down leaves the user near its bottom: in the reproduction the first matching row was **1,328.5px above the viewport**. `MenuTools` filters content without positioning the new result set. Home section links also use anchors while in-Menu sections use filtering, producing two orientation models.

**Evidence:** [Category switch after scrolling](category-scroll-390.png); [measurements](navigation-measurements.log).

**Fix:** Open the selected dish from its Home card. Make the active destination truthful. Choose a consistent category model, reset position when the category deliberately changes, and preserve position when returning from dish detail. Retain search and Draft separately.

**Acceptance:** “Choose this dish,” “go to this category” and “return to where I was” each produce the expected result through both app navigation and browser Back.

### F06 — P2: Table selection has state in code but no selected appearance

**Observed:** Choosing Table 2 sets `aria-pressed="true"`, but it has the same background, border and font weight as Table 1. Only the bottom button changing to “Send to Table 2” confirms the selection. The Table grid itself gives no visual confirmation.

**Evidence:** [Selected Table 2](table-selected-390.png); computed styles in [measurements](navigation-measurements.log); `order-service.tsx:222–225`.

**Fix:** Add a clear selected tile treatment with text/check indicator as well as colour. Keep the explicit Send button. Consider “Choose your table” for the preceding action: the present first “Send” opens another step rather than sending.

**Acceptance:** The selected Table is obvious before the final Send, including in a grayscale view. Selecting another Table visibly transfers the selection and does not submit.

### F07 — P2: Menu density is inefficient even with perfect photographs

**Observed:** The first three rows each measure **186px high**, plus 12px gaps. At 390×844, approximately two complete dishes fit before the fixed navigation; a Draft dock reduces useful space further. The 104px media/text area and a full-width 44px price/action row force this height. Brand header, title, search and category navigation also occupy a substantial part of the first viewport.

**Evidence:** [Menu](menu-390.png), [Menu with Draft dock](draft-390.png); `globals.css:51–62`. This is a layout finding, not criticism of placeholder imagery.

**Fix:** Compose the price and Choose action into the row's main content area where width permits. Aim for roughly 128–152px typical rows while allowing long content to grow. Keep 44–48px touch targets, intact prices and accessible full descriptions. Make the scrolled navigation compact without hiding orientation.

**Acceptance:** Compare real long names and required prices at 320/390px. The normal phone viewport should expose more useful choices without smaller controls, clipped text or lost context.

### F08 — P2: The Waiter queue still looks like nested administration forms

**Observed:** A one-dish pending Order sits inside an outer section, a Table card and an inset Order panel, with repeated “New Order” labels and separate disclosures for Order decisions, moving the Order and moving the Visit. Empty Tables then form a long vertical list. A full static bilingual Menu is rendered below the queue.

**Evidence:** [Pending Waiter view](waiter-pending-390.png), [empty service](waiter-empty-390.png), [accepted state](waiter-accepted-390.png); `staff/page.tsx:71–82` and `my-tables.tsx:178–278`.

**Fix:** Use one clear Table group with concise independent Order rows. Prioritize Table, oldest pending time, quantity, note and Accept. Group secondary actions under one labelled action area. Move Menu reference to a separate searchable tool. Show quiet Tables compactly, apart from pending work.

**Acceptance:** During a busy service the Waiter can find the oldest pending Order and act without navigating several decorative containers or scrolling a static reference Menu. Preserve independent Orders, undo and all Bill/new-party constraints.

### F09 — P2: Manager operations is a directory with live content, not yet a service cockpit

**Observed:** The landing card says “Service is running,” then has Exceptions, Open Tables and a collection of similarly styled links. The inspected running-Shift state does not surface on-duty/assigned staffing, workload counts or a clear recommended next action. The Venue page then presents another grid of destinations followed by enrollment and setup.

**Evidence:** [Operations](manager-operations-390.png), [Venue page](venue-setup-390.png); `operations/page.tsx:37–47`.

**Fix:** Summarize actual service readiness and pending work first: Shift, on-duty/assigned Waiters, unassigned Tables, pending Orders and receipt exceptions. Prioritize the next unresolved issue. Keep operational tools stable across Venue subpages and move access/setup into explicitly named secondary destinations. Use real counts, not invented metrics.

**Acceptance:** The Manager can answer “Are we ready, what needs attention, and where do I resolve it?” without opening several destinations.

### F10 — P2: Owner guidance is not sufficiently aware of setup state

**Observed:** The fixture already has a published Menu, a Waiter and a running assigned Shift. Owner Home still uses the insufficient-data message with a primary **“Set up service”** action. The code chooses that action whenever the finding is insufficient, rather than choosing based on the missing prerequisite. Venue creation remains a permanently exposed form below.

**Evidence:** [Owner Home](owner-home-390.png); `owner-home.tsx:63–64`.

**Fix:** Distinguish incomplete setup from running service with insufficient feedback/history. In the latter state, explain what is accumulating and offer relevant operations/evidence access. Keep actual sample counts in evidence. Move Add Venue behind a deliberate secondary action.

**Acceptance:** A returning Owner who has finished setup is not directed to repeat it. The primary action reflects an actual incomplete task or useful next step.

### F11 — P2: Shared styling is not yet a disciplined interaction system

**Observed:** The guest Menu uses bright button-like Choose labels, while operational routes alternate between underlined text, pill links, nested bordered sections and native disclosures. Several screens gain their appearance through broad CSS selectors rather than an intentional composition. Destructive removal is prominent beside each Waiter, while daily operational links have similar visual weight. Feedback Submit and Skip share the same button style in the source.

**Evidence:** [Venue navigation and removal](venue-setup-390.png), [operations links](manager-operations-390.png), [editor](editor-390.png); `staff.css`, `guest-reviews.tsx:111–114`.

**Fix:** Establish consistent task patterns, not merely colours/radii: page heading plus next action; navigation links distinct from commands; inline status; secondary actions grouped consistently; destructive controls contextual. Flatten unnecessary card nesting. Preserve good native controls rather than adding decorative custom components.

**Acceptance:** A person moving from Shifts to Menu editing to Venue setup can predict where primary actions, status and secondary actions live. Review hierarchy on each page, not just token usage.

### F12 — P2: Input boundaries fall just below the required contrast threshold

**Observed:** Search and shared staff input borders use `#959b8f`. Against white this is **2.852:1**, below 3:1; the warm surrounding canvas does not increase that contrast. For empty text inputs, the outline is the meaningful cue identifying the field. This is not a claim that every decorative border must pass 3:1 or that the app's body text fails.

**Evidence:** `globals.css:58`, input overrides in `staff.css`; [empty editor search](editor-390.png). [W3C Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) distinguishes necessary control boundaries from optional decoration.

**Fix:** Use a verified control-border token that clears 3:1 against all supported surfaces, with headroom. Keep quieter decorative separators separate. Recheck focused/invalid states and both Brand themes.

**Acceptance:** Empty controls are identifiable at rest; visible labels, focus and error associations work together. The app's 44–48px touch goal is stricter than [WCAG's 24px AA target minimum with exceptions](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html); do not confuse those two standards.

## What should be retained

The four-destination navigation is appropriately small. Explicit Table confirmation is safer than immediate submission. Price values stay together. The dish sheet groups options, notes, quantity and Add sensibly and uses a native dialog. Search works once the client runtime is active. The tested 320px Amharic Menu fits the viewport without horizontal document overflow. Save/Publish separation, recovery and revision protection are valuable foundations. Warm neutrals and restrained Brand accents are suitable for the product.

These strengths argue for a targeted completion pass, not another wholesale visual reset or a new component framework.

## Recommended implementation order

1. **Correct misleading interactions:** visible upload errors; sent/accepted/Bill messaging; Choose accessible labels; selected Table styling; truthful active navigation and intended destinations.
2. **Finish the two most demanding workspaces:** focused mobile Menu editing with reachable save state, and a compact task-first Waiter queue.
3. **Refine orientation and density:** category position, guest row composition, Manager readiness and context-aware Owner guidance.
4. **Verify design quality explicitly:** shared control hierarchy/contrast, named mobile and desktop reference screens, keyboard walkthroughs and observed first-time tasks. Add regression assertions for the reproduced interaction failures; use human comparison for composition.

Reopen the relevant delivery acceptance in tickets 03, 05, 06, 09, 11, 12, 14, 15 and 17. Treat the existing coverage register's “Implemented” as a code-migration record, not proof that design acceptance has passed.

## Local preview note

The development instance at port 3111 served HTML but did not activate the client interactions reliably; its logs also reported blocked development-origin/HMR access. A fresh production instance opened the same dish correctly. The normal local URL is now served by the existing production build using `pnpm start -p 3111`, and dish activation was rechecked there. This environment-specific observation is not counted as a confirmed production UI defect. Hot reload is not active in that preview.

## Modern Web Guidance

I used `accessibility`, `forms`, `dialog` and `form-factor-adaptation` to assess visible feedback, accessible names, native modal behaviour and responsive controls. No application code was changed. In particular, the guidance that “Any visible text used to label a control must be included exactly as written in the control's accessible name” informed F04, and “move focus to the first invalid field (or an error summary)” informed the recovery recommendation in F01. Native dialogs are a sound existing choice; this audit does not recommend replacing them.

## Implementation follow-up

The user authorized implementation of all non-placeholder findings. See [the implementation record](implementation.md) for production changes and current verification. The observations above describe the pre-fix build.
