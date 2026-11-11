# 29: Admin support view and fasting calendar

**What to build:** The platform admin can open any brand's data read-only, to support owners without changing their records, and can maintain the fasting calendar's seasons and exceptions so fasting sections rise to the top on the right days every year. Covers spec user stories 122 and 123.

**Blocked by:** 07 (Staff sign-in, brands, venues and tables), 04 (Fasting days and the House favourite)

**Status:** resolved

- [x] The admin can list brands and open any brand's venues, Menu, staff, Visits and Payment Options in a read-only view.
- [x] No command that changes brand data is available from the support view, and the core refuses such commands from the admin's support session.
- [x] Every support view opening is written to the audit log.
- [x] The admin can add, edit and remove fasting seasons and exceptions with dates. Changes take effect on the guest menu immediately.
- [x] Core tests cover the read-only guarantee and calendar changes.
