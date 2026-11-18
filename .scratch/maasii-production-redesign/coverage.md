# Production redesign coverage

> Round 2: the [audit implementation record](audit-round-2/implementation.md) documents the production fixes, revised workflows and fresh verification. The original audit remains historical evidence; manual release gates remain open.

Status records implementation and verification separately. No pending item counts as complete.

| Surface | Ticket | Implementation | Verification |
| --- | --- | --- | --- |
| `src/app/admin/brands/[brandId]/page.tsx` | 16 | Implemented | admin-support; staff-sign-in; manual release review pending |
| `src/app/admin/brands/[brandId]/support/page.tsx` | 16 | Implemented | admin-support; staff-sign-in; manual release review pending |
| `src/app/admin/fasting-calendar/page.tsx` | 16 | Implemented | admin-support; staff-sign-in; manual release review pending |
| `src/app/admin/layout.tsx` | 16 | Implemented | admin-support; staff-sign-in; manual release review pending |
| `src/app/admin/not-found.tsx` | 16 | Implemented | admin-support; staff-sign-in; manual release review pending |
| `src/app/admin/page.tsx` | 16 | Implemented | admin-support; staff-sign-in; manual release review pending |
| `src/app/invite/[token]/page.tsx` | 02 | Implemented | staff-sign-in; staff-notifications; manual release review pending |
| `src/app/join/[token]/page.tsx` | 02 | Implemented | staff-sign-in; staff-notifications; manual release review pending |
| `src/app/layout.tsx` | 16 | Implemented | guest-menu; guest-homepage; draft; languages; web-reliability; production-redesign; manual release review pending |
| `src/app/manage/brands/[brandId]/branding/page.tsx` | 15 | Implemented | branding; brand-social-links; production-redesign; manual release review pending |
| `src/app/manage/brands/[brandId]/menu/page.tsx` | 09 | Implemented | menu-editor; venue-menu; production-redesign; manual release review pending |
| `src/app/manage/layout.tsx` | 14 | Implemented | staff-sign-in; insights; production-redesign; manual release review pending |
| `src/app/manage/not-found.tsx` | 14 | Implemented | staff-sign-in; insights; production-redesign; manual release review pending |
| `src/app/manage/operations/page.tsx` | 14 | Implemented | staff-sign-in; insights; production-redesign; manual release review pending |
| `src/app/manage/page.tsx` | 15 | Implemented | staff-sign-in; insights; production-redesign; manual release review pending |
| `src/app/manage/venues/[venueId]/closing/page.tsx` | 14 | Implemented | orders; production-redesign; manual release review pending |
| `src/app/manage/venues/[venueId]/floor/page.tsx` | 14 | Implemented | live-floor; production-redesign; manual release review pending |
| `src/app/manage/venues/[venueId]/insights/page.tsx` | 14 | Implemented | insights; production-redesign; manual release review pending |
| `src/app/manage/venues/[venueId]/menu/edit/page.tsx` | 09 | Implemented | menu-editor; venue-menu; production-redesign; manual release review pending |
| `src/app/manage/venues/[venueId]/menu/page.tsx` | 09 | Implemented | menu-editor; venue-menu; production-redesign; manual release review pending |
| `src/app/manage/venues/[venueId]/page.tsx` | 14 | Implemented | staff-sign-in; insights; production-redesign; manual release review pending |
| `src/app/manage/venues/[venueId]/payment-options/page.tsx` | 14 | Implemented | payment-options; production-redesign; manual release review pending |
| `src/app/manage/venues/[venueId]/shifts/page.tsx` | 14 | Implemented | shifts; production-redesign; manual release review pending |
| `src/app/page.tsx` | 16 | Implemented | guest-menu; guest-homepage; draft; languages; web-reliability; production-redesign; manual release review pending |
| `src/app/sign-in/page.tsx` | 02 | Implemented | staff-sign-in; staff-notifications; manual release review pending |
| `src/app/staff/layout.tsx` | 12 | Implemented | orders (Chromium/WebKit); staff-sign-in; staff-notifications; manual release review pending |
| `src/app/staff/page.tsx` | 12 | Implemented | orders (Chromium/WebKit); staff-sign-in; staff-notifications; manual release review pending |
| `src/app/staff/tables/[tableId]/page.tsx` | 13 | Implemented | orders (Chromium/WebKit); staff-sign-in; staff-notifications; manual release review pending |
| `src/app/staff/tables/[tableId]/quick-add/page.tsx` | 13 | Implemented | orders (Chromium/WebKit); staff-sign-in; staff-notifications; manual release review pending |
| `src/app/v/[token]/feedback/page.tsx` | 08 | Implemented | guest-feedback; venue-experience; orders; manual release review pending |
| `src/app/v/[token]/menu/page.tsx` | 03 | Implemented | guest-menu; guest-homepage; draft; languages; web-reliability; production-redesign; manual release review pending |
| `src/app/v/[token]/not-found.tsx` | 03 | Implemented | guest-menu; guest-homepage; draft; languages; web-reliability; production-redesign; manual release review pending |
| `src/app/v/[token]/page.tsx` | 03 | Implemented | guest-menu; guest-homepage; draft; languages; web-reliability; production-redesign; manual release review pending |
| `src/app/v/[token]/payment/page.tsx` | 07 | Implemented | payment-options; orders; manual release review pending |
| `src/app/v/[token]/social/page.tsx` | 03 | Implemented | brand-social-links; guest-homepage; manual release review pending |
| `src/app/v/[token]/more/page.tsx` | 03, 11 | Implemented | guest-homepage; production-redesign session preference test |

## Shared controls and exceptional states

| Surface | Ticket | Required states | Evidence |
| --- | --- | --- | --- |
| Guest header, navigation, language and continuation | 02, 03 | Current destination; no JavaScript; denied Draft storage; long Brand names | guest-homepage, languages, production-redesign |
| Price and dish rows | 02, 04 | Long names; large prices; 320/375/390/768/1440 widths; Amharic; missing/failed image | guest-menu, production-redesign screenshots |
| Native dish/Draft dialogs and action footer | 04 | Required choices; notes; quantity; editing/removal; focus trap/return; Escape/Back/backdrop; landscape | draft, web-reliability, production-redesign |
| Table selection and Send | 05 | No selection; explicit confirmation; sending; offline; uncertain acknowledgement; immutable retry | orders in Chromium/WebKit, production-redesign |
| Order/Visit/Bill surfaces | 06, 07 | Sent/accepted/declined/dropped; prepared/reopened/paid; stale feed; reconnection; new party | orders, production-redesign |
| Payment details/copy | 07, 15 | Public details; no Visit; missing methods; denied clipboard; changed account comparison | payment-options, orders |
| Private feedback sections | 08 | Ineligible; Visit first; optional tried dishes and service; pending/error/saved; phone deduplication | guest-feedback, orders, reviews core tests |
| Editor search, bilingual fields and preview | 09 | Brand/Venue scope; local/inherited/restored values; dirty/saved/unpublished/published; missing translations | menu-editor, venue-menu, production-redesign |
| Editor navigation/recovery/conflict | 09 | Save/Discard/Stay; internal links, browser Back and external form guard; reload recovery; denied storage; stale base revision; comparison/new tab; confirmed discard | production-redesign; core revision tests |
| Photo/video controls and playback | 10, 11 | Upload/replace/remove; malformed/oversized; no poster; unpublished/published; scoped inheritance; reduced motion; session preference; data saving; explicit pause; failed media | dish-videos, branding/menu core tests; production-redesign in Chromium/WebKit |
| Waiter queue and Table decisions | 12, 13 | No Shift/no assignments/no Orders; independent Orders; undo; move/correct/drop; prepared Bill; empty receipt amount | orders, staff-sign-in, staff-notifications |
| Staff buttons, fields, notices and forms | 02, 12–16 | Primary/secondary/quiet/destructive; busy/disabled; validation; success/error; keyboard focus; confirmation | shared staff-forms/field; role browser suites |
| Manager floor/setup and removal | 14 | No Shift; unassigned Tables; exceptions; live floor; setup disclosure; consequential cancellation/removal | shifts, live-floor, staff-sign-in, orders |
| Owner findings and settings | 15 | Insufficient data with actual counts and next step; evidence navigation; permission boundaries | insights, branding, brand-social-links, payment-options |
| Platform/support/access errors | 02, 16 | Invitations, sign-in, enrollment, PIN unlock; read-only support; forbidden/unknown routes; calendar | admin-support, staff-sign-in, staff-notifications |

Automated coverage is not a claim that every possible visual or assistive-technology state has received human sign-off. The final manual sweep, screen-reader checks and real software-keyboard behavior remain release gates below.

## External release gates

- [ ] Supported real-phone foreground/background/locked notification delivery.
- [ ] Fluent Amharic review.
- [ ] First-time guest and working staff observation.
- [ ] Deployment and post-deployment smoke checks.

- [ ] Human visual review of every register entry, including all validation/destructive states.
- [ ] Screen-reader announcement and real software-keyboard review.
- [ ] Real-device video autoplay, data-saving, visibility and pause behavior across supported browsers.

## Recommendation traceability

| Recommendation | Tickets | Runnable evidence |
| --- | --- | --- |
| 1. Readable prices | 02, 04 | guest-menu; production-redesign width sweep |
| 2. Home continuation | 03 | guest-homepage; orders |
| 3. Menu orientation | 03 | guest-menu; languages |
| 4. Dish interaction | 03, 04 | draft; production-redesign Back/search test |
| 5. Explicit Send | 05 | orders; production-redesign stale test |
| 6. Truthful availability and status | 05, 06 | orders offline/retry; production-redesign failed refresh |
| 7. Protected editing | 09 | menu-editor; production-redesign recovery/conflict/denied storage |
| 8. Scope and inheritance | 09 | venue-menu; venue-menu-publishing core tests |
| 9. Waiter queue/readiness | 12, 13 | orders; staff-notifications; core orders |
| 10. Manager operations/removal | 14 | live-floor; shifts; staff-sign-in session revocation |
| 11. Owner guidance | 15 | insights; actual insufficient-data counts retained |
| 12. Progressive private feedback | 08 | orders; guest-feedback; reviews core tests |

## Round 2 additions

| Surface | Ticket | Verification |
| --- | --- | --- |
| Shared Venue tool navigation (`src/app/manage/venues/[venueId]/layout.tsx`) | 14 | Manager/Owner navigation, scope errors and responsive route sweep |
| Waiter Menu reference (`/staff?view=menu`) | 12 | Waiter enrollment, bilingual search and session/PIN authorization |
| Focused dish workspace and upload feedback | 09–11 | Brand/Venue authoring plus audit regression cases in both engines |

See [round 2 implementation](audit-round-2/implementation.md) for F01–F12 traceability and retained release gates.
