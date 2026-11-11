# 08: Waiters join with a QR code and PIN

**What to build:** A manager shows a join QR on their phone. A waiter scans it, chooses their name, sets a 4-digit PIN and is signed in on their own phone with a long-lived session, unlocked by the PIN. A manager can remove a waiter, which signs them out everywhere immediately. Staff screens default to Amharic, with English available, and dish names are shown in both languages. Covers spec user stories 48, 49, 50, 51, 76 and 77.

**Blocked by:** 07 (Staff sign-in, brands, venues and tables), 02 (Amharic and English everywhere)

**Status:** ready-for-agent

- [x] A manager can display a short-lived join QR for their venue. An expired or reused code is refused with a clear message.
- [x] Scanning it lets a waiter enter their name and set a 4-digit PIN, creating a Waiter membership at that venue only.
- [x] The waiter's device stays signed in across days, and opening Maasii asks only for the PIN.
- [x] Repeated wrong PINs are rate-limited, and the device then needs a fresh join from a manager.
- [x] Removing a waiter revokes all their sessions, and their next action on any device is refused.
- [x] Staff screens default to Amharic and can switch to English per person. Dish names on staff screens always show both languages.
- [x] Core tests cover joining, expiry, PIN unlocking, rate limiting and removal.
