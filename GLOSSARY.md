# Maasii table service

Maasii is the product. Guests at an independent Ethiopian café or restaurant tap or scan a card on their table to read the menu, send orders to their waiter, find the venue's payment details and leave private feedback. Staff run service from the same system, and the owner manages the menu and learns from orders and feedback.

## Places and people

**Brand**:
The business a guest recognises, such as Bilo's. A brand owns the menu and the look, and has one or more venues.
_Avoid_: Company, client, chain, tenant

**Venue**:
One café or restaurant location of a brand, with its own tables, staff, dish availability and any price differences from the brand's menu.
_Avoid_: Branch, outlet, restaurant, shop, store

**Table**:
A numbered physical place in a venue where a party sits.
_Avoid_: Seat, spot

**Venue Link**:
The single web address that opens a venue's menu. It is the same on every table, and guests reach it by NFC tap or QR scan.
_Avoid_: Table link, menu URL, tag

**Table Choice**:
The table number a guest says they are sitting at, which tells the system whose visit their orders belong to. Choosing a table is not proof of being there. A waiter's acceptance is.
_Avoid_: Check-in, table login

**Guest**:
A person using the menu from a table, without an account.
_Avoid_: Customer, user, diner

**Waiter**:
A staff member who serves tables and receives guests' orders.
_Avoid_: Server, staff (when a specific role is meant)

**Owner**:
A person who runs a brand: its menu, look, Payment Options, staff and insights across all its venues.
_Avoid_: Admin, client

**Manager**:
A person who runs service at one venue: shifts, Table Assignments, sold-out dishes, payment confirmations and waiters.
_Avoid_: Supervisor, floor lead

**Usual Tables**:
The tables a waiter normally serves, offered as the default Table Assignment when a shift starts.
_Avoid_: Section, zone

**Shift**:
A period during which a set of waiters is on duty at a venue.
_Avoid_: Session, rota

**Table Assignment**:
Which waiter is responsible for a table during a shift.
_Avoid_: Section, allocation

## Menu

**Menu**:
A brand's list of dishes, grouped into sections, in Amharic and English. Guests only ever see the published menu. Changes wait in a draft until the owner publishes them.
_Avoid_: Catalog

**Dish**:
Anything a guest can order from the menu, food or drink.
_Avoid_: Item, product, menu item

**Option Group**:
A set of choices attached to a dish, either "choose one" (such as bagel type or size) or "add extras", where each choice may change the price.
_Avoid_: Modifier, variant, add-on

**Sold Out**:
A dish that a venue cannot serve right now. It is hidden from that venue's menu until switched back on.
_Avoid_: Unavailable, out of stock, 86'd

## Service

**Visit**:
One party's time at a table, from their first order until their bill is settled.
_Avoid_: Session, sitting, check

**Order**:
A group of dishes sent together during a visit, either by a guest from their phone or entered by a waiter. A visit can contain several orders.
_Avoid_: Ticket, request

**Draft**:
Dishes a guest has picked on their own phone but not yet sent. Each phone at a table has its own draft.
_Avoid_: Cart, basket

**Accepted Order**:
An order a waiter has acknowledged. Only accepted orders count towards the bill, and acceptance is what shows a real party is at the table.
_Avoid_: Confirmed order, approved order

**Declined Order**:
An order a waiter refused as a whole, for example because nobody is at the table.
_Avoid_: Rejected order, cancelled order

**Dropped Dish**:
A dish in an order that the waiter could not accept, for example because it is sold out. The guest sees which dish was dropped and why.
_Avoid_: Rejected item, cancelled item

**Bill**:
What a visit owes: the prices of its accepted orders and one total. Each visit has exactly one bill. It is not a tax receipt.
_Avoid_: Check, invoice, receipt

**Prepared Bill**:
A bill the waiter has locked for payment. The same party cannot add orders until it is reopened.
_Avoid_: Final bill, closed bill

**Official Receipt**:
The receipt printed by the venue's government-registered cash register. It is the source of truth for what a visit actually paid.
_Avoid_: Tax receipt, fiscal receipt, invoice

**Payment Confirmation**:
A waiter's record that a bill was paid, with the method and the amount the waiter typed from the official receipt.
_Avoid_: Payment, settlement

**Receipt Difference**:
The gap between a bill's total and the official receipt amount recorded at payment confirmation. It is flagged to the manager.
_Avoid_: Mismatch, discrepancy, variance

**Payment Option**:
A payment method the venue accepts, with the recipient details a guest needs to pay outside this system.
_Avoid_: Payment method, gateway

## Feedback

**Visit Review**:
A guest's private rating of the visit as a whole.
_Avoid_: Survey, rating

**Dish Review**:
A guest's private answer to "Would you order it again?" about one dish their table ordered.
_Avoid_: Item rating, dish rating

**Waiter Rating**:
A guest's private rating of the waiter who served their visit, visible only to managers once the waiter has enough responses.
_Avoid_: Staff score, service rating

## Insights

**Service Period**:
A named part of the day the venue defines, such as breakfast, lunch or evening, used to compare like with like.
_Avoid_: Daypart, shift (a shift is about staff, not the menu)

**Weekly Finding**:
The one observation about dishes or visits that the owner is shown each week, linked to the orders and reviews behind it.
_Avoid_: Insight, tip, recommendation
