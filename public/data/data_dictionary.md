# What each column means

The classified files: `free_parking_streets.csv` (one row per street) and
`free_parking_sections.csv` (one row per street section). Both come from
the sister project Toronto Open Street Parking, which combined the City of
Toronto's open data into one file of 50,027 street sections carrying the
city's published parking rule counts (Chapter 950, current rules).

## The class column

Every street gets one class. Sections carry the class of their street,
because the city publishes its parking rules by street, not by section.

| class | name on the map | meaning |
| --- | --- | --- |
| `free` | Free, time limit applies | The street has time-limited parking rules, and they are at least as many as its no parking, no stopping, and no standing rules combined. |
| `norule` | No parking rule published | The city's published rules list no parking rule for this street at all. |
| `noparking` | No parking | The street's no parking, no stopping, and no standing rules outnumber its time-limited parking rules. |
| `winter` | Only winter rules | The street's only published rules are winter or snow rules, or a special use such as a school bus loading zone or a taxi stand. Nothing in the published rules speaks to everyday parking. |

The classes are applied in the order listed: the first one that matches a
street wins.

There is no paid class. The parking rules the city publishes as open data
contain no paid or metered parking category, and no open file says which
streets carry meters, so paid status cannot be read off the data. A street
shown as free can still have paid meters on it.

## free_parking_streets.csv

- `street`, `street_norm`: the street's name, and the same name tidied
  into one capitalised form for matching.
- `class`: the street's class, as above.
- `segments`: how many street sections the street has. A street section is
  the part of a street between two cross streets.
- `length_km`: the street's total length in kilometres.
- `rules_total`: the street's published parking rules (current Chapter 950
  rules, all kinds).
- `no_parking_rules`, `no_stopping_rules`, `no_standing_rules`,
  `time_limited_rules`: the street's published rules of each kind. Their
  sum is the `bans` figure the classification uses (the first three) and
  the `timed` figure (the fourth).
- `winter_rules`: the street's winter parking prohibited and snow storm
  parking rules.
- `tickets_2023_2025`: parking tickets written on the street, 2023 to
  2025.
- `permit_share`: the share of the street's sections whose midpoint falls
  in a permit parking area (0 to 1).
- `bike_infra_share`: the share of the street's sections with cycling
  infrastructure matched to them (0 to 1).

## free_parking_sections.csv

- `segment_id`: the section's number in the city's street map file.
- `street`, `street_norm`, `class`: the section's street and its class.
- `road_class`: the city's class for the road (Local, Collector, Minor
  Arterial, Major Arterial, Expressway, Laneway, and similar).
- `oneway`: True when the section is one-way.
- `length_m`: the section's length in metres.
- `addr_lo_l`, `addr_hi_l`, `addr_lo_r`, `addr_hi_r`: the lowest and
  highest street numbers on the left and right sides of the section, where
  the city publishes them.
- `bike_infra_type`: the kind of cycling infrastructure on the section,
  empty when none was matched.
- `permit_area`: the permit parking area code the section's midpoint
  falls in, empty when none.
- `nearest_green_p_m`: metres to the nearest Green P car park, empty when
  none was recorded.
