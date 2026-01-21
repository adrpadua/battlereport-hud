# Game Narrator Prompt Improvements

These additions address mistakes found in the narration output.

---

## 1. Faction Validation Rules

The prompt doesn't tell the model to validate that units belong to the correct faction. The Plasmancer error (Necron unit attributed to Space Wolves) could be prevented:

```markdown
### Faction Validation
- CRITICAL: Units MUST belong to their declared faction. Do not attribute units from other factions.
- If a unit name doesn't match any known unit for the declared factions, note it as "[UNKNOWN UNIT]" rather than guessing.
- Common cross-faction errors to avoid:
  - Plasmancers are NECRON only
  - Crypteks are NECRON only
  - Techmarines are SPACE MARINE only
```

---

## 2. Tag Type Validation

The prompt doesn't clarify what should get each tag type, leading to `[UNIT:Overwhelming Firepower]` and `[STRATAGEM:Sabotage]`:

```markdown
### Tag Usage Rules
- `[UNIT:Name]` = ONLY actual unit datasheets (models that can be fielded)
- `[STRATAGEM:Name]` = ONLY stratagems from rulebook or codex (cost CP)
- `[OBJECTIVE:Name]` = Secondary objectives, mission cards, scoring conditions
- DO NOT tag as [STRATAGEM]: Advance, Fall Back, Smoke Grenades, or other core actions (these are rules, not stratagems)
- DO NOT tag as [UNIT]: Overwhelming Firepower, Assassinate, Bring It Down, Sabotage (these are [OBJECTIVE])
- NOTE: Grenade IS a valid core stratagem (1CP, Shooting phase) - DO tag it as [STRATAGEM:Grenade]
```

---

## 3. Timestamp Validation

Prevent backwards timestamps like `[6:49–6:10]`:

```markdown
### Timestamp Rules
- Timestamps must be chronologically valid (start time < end time)
- When citing a range, format as [MM:SS–MM:SS] where second value is GREATER
- If unsure of exact timestamp, use a single timestamp rather than an invalid range
```

---

## 4. Turn Order Clarification

The prompt's turn order section is ambiguous:

```markdown
### Turn Order (CRITICAL)
- The player who wins the roll-off CHOOSES to be Attacker or Defender
- Attacker ALWAYS goes first each round
- Defender ALWAYS goes second each round
- If Player A wins roll-off and chooses Defender: Player B (Attacker) has Turn 1 first
- Label turns by the acting player, not by round number confusion
```

---

## 5. Quote-Header Consistency Rule

```markdown
### Quote Attribution
- When a header describes a unit's action, the supporting quote MUST match that unit
- If a quote contradicts the header, re-read the transcript to resolve the conflict
- Never mix Player A's quote with Player B's action description
```

---

## 6. Spelling Accuracy Guidance

```markdown
### Spelling & Terminology
- Use canonical GW spellings: Haemonculus (not Himunculus), Kabalite Warriors (not cabalite wars), Ichor Injector (not ikra injector)
- Use the exact spelling from tagged terms in the input transcript
- Common misspellings to avoid: Kull→Cull, Himunculus→Haemonculus, ikra→ichor
- Fix typos in your output: "survivied"→"survived"
```

---

## 7. Unit Name Consistency

The narration uses inconsistent names for the same unit:

```markdown
### Unit Name Consistency
- Use the SAME unit name throughout the document for the same unit
- BAD: `[UNIT:Wolfguard Terminator Squad]` in one place, `[UNIT:Terminator Squad]` elsewhere
- BAD: `[UNIT:Thunderwolf Cavalry]` and `[UNIT:Thunderwolf]` (Thunderwolf alone is not a unit)
- BAD: `[UNIT:Scourge]` vs `[UNIT:Scourges]` - use the official datasheet name (Scourges)
- When first introducing a unit, use its full official name, then be consistent
```

---

## 8. Timestamp-Turn Alignment

Timestamps cited should match the turn being described:

```markdown
### Timestamp-Turn Alignment
- Timestamps cited in a turn section MUST fall within that turn's timeframe
- BAD: Describing Turn 2 events but citing [27:05–27:14] which is from Turn 3
- If you need to reference an earlier/later event, explicitly note "as mentioned in Turn X"
- Do not combine timestamps from different turns in a single sentence
```

---

## 9. Transcription Artifact Handling

The narration includes unclear transcription artifacts:

```markdown
### Transcription Artifacts
- If transcript text is garbled or unclear (e.g., "killed all the finish"), do NOT include it
- Mark unclear portions as [unclear] rather than guessing
- "wizzy wig" likely means WYSIWYG - either clarify or omit
- "head hunter" is not a unit name - identify the actual unit or mark as [unknown unit]
- "mandri" is informal for Mandrakes - use the proper tagged name
```

---

## 10. Redundant/Conflicting Unit Listings

```markdown
### Army List Clarity
- Do not list the same unit twice with different names (e.g., Battle Leader AND Lieutenant for Space Wolves - they're the same role)
- Do not create phantom units - "Thunderwolf" alone is not a unit, only "Thunderwolf Cavalry" exists
- Clarify detachment vs sub-faction: "Coven" is the detachment type, "Haemonculus Covens" is the sub-faction name
```

---

## 11. Nested Tag Formatting

```markdown
### Tag Formatting
- Tags should not contain nested brackets: `[UNIT:Wolf Guard [Legends]]` is WRONG
- Correct format: `[UNIT:Wolf Guard]` with "(Legends)" outside if needed
- Keep tag content clean and parseable
```

---

## 12. Stratagem Name Accuracy

```markdown
### Stratagem Names
- Use exact stratagem names from the codex/rules
- "Distillers of Fear" - verify this is the actual stratagem name before using
- "Poisonous Art" - verify spelling and exact name
- If uncertain of the stratagem name, describe the effect without tagging
```

---

## 13. Pronoun Clarity in Scoring

```markdown
### Scoring Clarity
- When reporting scores, always specify WHICH player
- BAD: "bring you up to seven" - unclear who "you" refers to
- GOOD: "bringing Ben's score to 7" or "Scari now has 7 points"
- Use player names, not pronouns, when discussing scores
```

---

## 14. No Conversational Endings

The narration ends with "Which would you prefer next?" which is chat-like:

```markdown
### Document Format
- The narration is a STANDALONE DOCUMENT, not a chat response
- Do NOT end with questions like "Which would you prefer next?" or "Let me know if you want..."
- Do NOT offer to produce alternative formats
- End with the Final Results section, not conversational prompts
```

---

## 15. Player-Unit Attribution

The narration confuses which player owns which units:

```markdown
### Player-Unit Attribution
- CRITICAL: Track which player owns which units throughout
- Scari (Drukhari) cannot use Rapid Ingress on Terminators - he doesn't have them
- Ben (Space Wolves) owns Terminators, Thunderwolf Cavalry, etc.
- When quoting, verify the speaker matches the faction being discussed
- BAD: "Scari: '[STRATAGEM:Rapid Ingress] [UNIT:Terminator Squad]'" when Scari plays Drukhari
```

---

## 16. Vague Language in Army Lists

```markdown
### Army List Specificity
- Do NOT use "etc." in army lists - be specific or omit
- BAD: "[UNIT:Gladiator Lancer], [UNIT:Whirlwind], [UNIT:Thunderwolf], etc."
- If uncertain about additional units, note "additional units mentioned but not specified"
```

---

## 17. Detachment Tagging

Detachments mentioned should be tagged:

```markdown
### Detachment Mentions
- Tag detachments with [DETACHMENT:Name] when mentioned
- BAD: "Stormlance list" - should be "[DETACHMENT:Stormlance Task Force]"
- The Game Setup section should clearly identify each player's detachment with proper tags
```

---

## 18. Weapon/Wargear Names

```markdown
### Weapon Name Accuracy
- Use complete, official weapon names
- BAD: "twin liquify" - should be "twin liquifier gun"
- BAD: "haywire" alone - should be "haywire blaster" or specify the weapon type
- Weapon names should match the datasheet
```

---

## 19. Undefined Game Terms

```markdown
### Game Term Clarity
- Explain or clarify faction-specific mechanics when first mentioned
- BAD: "oath target" - Space Wolves don't have "oath" mechanics; clarify what this refers to
- BAD: "with the spin" - unclear reference, omit or clarify
- BAD: "sticky" objectives - explain this means Objective Secured or similar rule
```

---

## Summary of Mistakes These Address

| Mistake | Fix |
| ------- | --- |
| Plasmancer (Necron) in Space Wolves army | Faction Validation |
| "Himunculus Coven" misspelling | Spelling Guidance |
| "ikra injector" misspelling | Spelling Guidance |
| `[UNIT:Overwhelming Firepower]` | Tag Type Validation |
| `[STRATAGEM:Sabotage]` | Tag Type Validation |
| Timestamp `[6:49–6:10]` backwards | Timestamp Validation |
| Quote says Talos, header says Terminators | Quote-Header Consistency |
| Turn order confusion (Defender going first) | Turn Order Clarification |
| "Kull the Horde" misspelling | Spelling Guidance |
| "survivied" typo | Spelling Guidance |
| `[UNIT:Terminator Squad]` vs `[UNIT:Wolfguard Terminator Squad]` | Unit Name Consistency |
| `[UNIT:Thunderwolf]` (not a real unit) | Unit Name Consistency |
| `[UNIT:Scourge]` vs `[UNIT:Scourges]` | Unit Name Consistency |
| Turn 2 section citing Turn 3 timestamps | Timestamp-Turn Alignment |
| "killed all the finish" (garbled text) | Transcription Artifacts |
| "wizzy wig" unclear | Transcription Artifacts |
| "head hunter" not a unit | Transcription Artifacts |
| Battle Leader AND Lieutenant listed | Redundant Unit Listings |
| `[UNIT:Wolf Guard [Legends]]` nested brackets | Tag Formatting |
| "Distillers of Fear" unverified stratagem | Stratagem Name Accuracy |
| "bring you up to seven" unclear pronoun | Pronoun Clarity |
| "Which would you prefer next?" conversational ending | No Conversational Endings |
| Scari using Rapid Ingress on Terminators (wrong faction) | Player-Unit Attribution |
| "etc." in army list | Vague Language |
| "Stormlance list" not tagged as detachment | Detachment Tagging |
| "twin liquify" truncated weapon name | Weapon Name Accuracy |
| "oath target" undefined mechanic | Undefined Game Terms |
| "with the spin" unclear reference | Undefined Game Terms |
| "+T aura" abbreviation | Abbreviation Expansion |
| "dev-wound" abbreviation | Abbreviation Expansion |
| Zero [OBJECTIVE:] tags in entire document | Objective Tag Consistency |
| "reserve / deep strike" redundant phrasing | Redundant Terminology |
| "Rapid Ingressed / redeployed" conflated | Action Terminology Precision |
| "One original Talos" unclear modifier | Unclear Modifiers |
| "(auto)" unexplained shorthand | Jargon Expansion |
| "shrine" in Incubi context unclear | Clear Equipment References |
| "Coven / Himunculus Coven" redundant | Redundant Category Naming |
| "core troops" outdated terminology | Current Edition Terminology |
| Header says Terminators, quote says Talos | Quote-Header Alignment |
| `[0:37][0:39][0:42]` fragmented timestamps | Timestamp Consolidation |
| "2x [UNIT:Cronos] (one unit of two)" confusing | Unit Count Clarity |
| "Archon disembarks" alone (no attached unit) | Embark/Disembark Clarity |
| "Both [UNIT:Venom] advanced" pluralization | Unit Pluralization |
| "resurrection/pain-token ability" unnamed | Undefined Ability References |
| Talos healing Cronos logic unclear | Healing Logic Explanation |
| "near the Turn 4/5 recap" vague timestamp | Vague Timestamp References |
| "surge+charge sequence" undefined term | Undefined Movement Terms |
| "literal game-enders" hyperbolic | Professional Tone |
| "Hammer & Anvil / Take and Hold" conflated | Mission vs Deployment Separation |
| "Overwhelming Force" vs "Overwhelming Firepower" | Secondary Card Name Accuracy |
| Plasmancer in non-Necron game (cross-faction) | Cross-Faction Unit Detection |
| "D3+1 returning" unexplained dice notation | Dice Notation Explanation |
| "Mandrakes, Scourge" untagged vs tagged elsewhere | Consistent Unit Tagging |
| "your Battle Leader" unclear whose | Pronoun Context in Quotes |
| "your priest" - which unit is "priest"? | Undefined Unit References |
| "transport suite" unusual term | Undefined Game Terms |

---

## 20. Abbreviation Expansion

```markdown
### Abbreviation Rules
- Do NOT use single-letter abbreviations: "+T aura" should be "+1 Toughness aura"
- Do NOT use shorthand like "dev-wound" - write "Devastating Wounds"
- Spell out all stat modifiers: +1 Strength, +1 Toughness, -1 to hit, etc.
- First use should always be the full term
```

---

## 21. Objective Tag Consistency

```markdown
### Objective Tagging
- ALL secondary objectives must be tagged with [OBJECTIVE:Name]
- BAD: "Behind Enemy Lines" without tag in one place, tagged elsewhere
- Tag these consistently: Recover Assets, Assassinate, Behind Enemy Lines, Overwhelming Firepower, Secure No Man's Land, Engage on All Fronts
- The Game Setup card list and in-game references must both use tags
```

---

## 22. Redundant Terminology

```markdown
### Avoid Redundant Phrasing
- Do NOT say "reserve / deep strike" - these are the same concept in context
- Do NOT say "Strategic Reserve / deep-strike" redundantly
- Pick one term and use it consistently
- Prefer the more specific term when applicable
```

---

## 23. Action Terminology Precision

```markdown
### Action vs Stratagem Clarity
- "Rapid Ingress" is a stratagem that brings reserves in during opponent's turn
- "Redeploy" is a different action (typically pre-game)
- BAD: "Rapid Ingressed / redeployed" - these are different mechanics
- Be precise about which game action occurred
```

---

## 24. Unclear Modifiers

```markdown
### Avoid Ambiguous Modifiers
- BAD: "One original Talos" - what makes it "original"?
- If referring to a specific model from the start of the game, say "one of the starting Talos"
- If referring to which unit, use identifiers like "the left flank Talos" or "Talos unit #1"
- Avoid modifiers that require context the reader doesn't have
```

---

## 25. Jargon Expansion

```markdown
### Expand Game Jargon
- Do NOT use "(auto)" - spell out "automatically scores" or "auto-passes"
- If a score is automatic due to board state, explain why briefly
- BAD: "Secure No Man's Land (auto)"
- GOOD: "Secure No Man's Land (automatically scored due to controlling three objectives)"
```

---

## 26. Clear Equipment References

```markdown
### Equipment/Upgrade Clarity
- BAD: "five [UNIT:Incubi] with shrine" - unclear what "shrine" means
- If referring to a unit champion, use "with Klaivex"
- If referring to a transport, use "in a [UNIT:Raider]"
- If the reference is unclear from transcript, mark as [unclear equipment] rather than guessing
```

---

## 27. Redundant Category Naming

```markdown
### Avoid Redundant Faction/Detachment Description
- BAD: "Coven / Himunculus Coven" - this says the same thing twice
- GOOD: "[DETACHMENT:Haemonculus Covens]" (single, correct term)
- Do not list both generic and specific names for the same thing
- Use the official detachment name only
```

---

## 28. Current Edition Terminology

```markdown
### Use Current Edition Terms
- BAD: "core troops" - "Core" was a 9th edition keyword, not used in 10th
- Use 10th edition terminology: Battleline, Character, etc.
- Do not reference obsolete edition mechanics unless players explicitly discuss them
- If unsure about a mechanic's edition, describe the effect without using the keyword
```

---

## 29. Quote-Header Alignment

```markdown
### Quote Must Match Header
- CRITICAL: When a header describes Unit A's action, the supporting quote MUST be about Unit A
- BAD: Header says "**[UNIT:Terminator Squad]**" but quote says "I Rapid Ingress my double unit of Talos"
- This is a fundamental attribution error - re-read the transcript to match quotes correctly
- If no direct quote exists for a header, do not fabricate one from a different context
```

---

## 30. Timestamp Consolidation

```markdown
### Timestamp Formatting
- Consolidate adjacent timestamps: BAD: `[0:37][0:39][0:42]` → GOOD: `[0:37-0:42]`
- Use ranges for continuous discussions, individual stamps only for discrete separate mentions
- Never list more than 3 separate timestamp references for a single point
```

---

## 31. Unit Count Clarity

```markdown
### Unit Count Phrasing
- BAD: "2x [UNIT:Cronos] (one unit of two)" - confusing phrasing
- GOOD: "1 unit of 2 [UNIT:Cronos]" or "a [UNIT:Cronos] unit (2 models)"
- Specify: number of units × models per unit
- "2x" notation should only mean "2 units of" not "2 models"
```

---

## 32. Embark/Disembark Clarity

```markdown
### Transport Actions
- Characters do not disembark alone - they disembark WITH their attached unit
- BAD: "The [UNIT:Archon] disembarks"
- GOOD: "The [UNIT:Archon] and attached unit disembark" or "The unit with [UNIT:Archon] disembarks"
- Specify which transport they're leaving/entering
```

---

## 33. Unit Pluralization

```markdown
### Unit Name Pluralization
- When referring to multiple transports, use proper pluralization
- BAD: "Both [UNIT:Venom] advanced"
- GOOD: "Both Venoms advanced" (no tag) or "Both [UNIT:Venom] transports advanced"
- Datasheet names are singular; add context for multiples
```

---

## 34. Undefined Ability References

```markdown
### Ability/Rule Clarity
- When referencing army-specific abilities, name them explicitly
- BAD: "resurrection/pain-token ability" - what is this rule called?
- BAD: "picking up a unit with a pain token" - name the actual ability
- GOOD: "using the [ABILITY:Power from Pain] resurrection ability"
- If uncertain of the rule name, describe the effect without implying a specific mechanic
```

---

## 35. Healing Logic Explanation

```markdown
### Combat/Ability Interactions
- When explaining complex interactions, be explicit about the cause-effect
- BAD: "one Talos stayed in combat so that a single Cronos wound would heal the Cronos"
- This sentence is unclear - how does Talos combat heal Cronos?
- GOOD: Explain the rule being used or omit if the mechanism isn't clear from transcript
```

---

## 36. Vague Timestamp References

```markdown
### Specific Timestamp Requirements
- Do NOT use vague temporal references
- BAD: "near the Turn 4/5 recap"
- BAD: "around this time"
- GOOD: Cite the specific timestamp `[34:42]`
- If timestamp is uncertain, use [~MM:SS] notation to indicate approximation
```

---

## 37. Undefined Movement/Charge Terms

```markdown
### Movement Terminology
- Define or clarify special movement terms when first used
- BAD: "surge+charge sequence" - what is "surge"?
- If "surge" is a stratagem or ability, name it: "[STRATAGEM:Surge Move]" or explain
- If it's informal player speech, clarify: "what the players called a 'surge' (rapid advance)"
```

---

## 38. Professional Tone

```markdown
### Maintain Neutral Reporting Tone
- Avoid informal/hyperbolic language in game reports
- BAD: "literal game-enders"
- BAD: "awesome" (when describing units)
- GOOD: "decisive final actions" or "game-deciding moments"
- Keep the tone factual and descriptive, not enthusiastic
```

---

## 39. Mission vs Deployment Separation

```markdown
### Mission Component Clarity
- Separate deployment type from mission type
- BAD: "Hammer & Anvil / Take and Hold" (unclear if these are alternatives or components)
- GOOD: "Deployment: Hammer & Anvil. Mission: Take and Hold"
- Use clear labels for each game setup component
```

---

## 40. Secondary Card Name Accuracy

```markdown
### Secondary Objective Names
- Use exact official card names
- BAD: "Overwhelming Force" when the card is actually "Overwhelming Firepower"
- If the transcript is unclear, mark as [unclear card name] rather than guessing
- Verify card names exist before using them - if uncertain, describe the scoring condition instead
```

---

## 41. Cross-Faction Unit Detection

```markdown
### Units Not in Either Army
- If a unit name doesn't belong to EITHER declared faction, flag it
- Plasmancer appears in this battle report but neither Drukhari nor Space Wolves have Plasmancers
- This is likely a transcription error - the actual unit may be misheard
- Mark as [UNIT:unknown - possibly misheard as "Plasmancer"] rather than using the wrong unit name
- Consider what the unit might actually be based on faction context
```

---

## 42. Dice Notation Explanation

```markdown
### Dice Roll Notation
- When using dice notation, either explain it or just report results
- BAD: "D3+1 returning" without context
- GOOD: "rolled D3+1 (a dice roll of 1-3 plus 1) and returned 3 Wracks"
- OR just report the result: "returned 3 Wracks via resurrection ability"
- Casual readers may not understand dice notation
```

---

## 43. Consistent Unit Tagging Throughout

```markdown
### Tag Units Consistently
- If a unit is tagged with [UNIT:Name] in one place, tag it EVERYWHERE it appears
- BAD: "Mandrakes, Scourge (carbine)" in one place but "[UNIT:Mandrakes]" elsewhere
- Every unit mention should be tagged, not just some
- Exception: Informal shorthand in direct quotes may omit tags
```

---

## 44. "Your/My" Pronouns in Quotes

```markdown
### Pronoun Context in Quotes
- Direct quotes often use "your" and "my" from player perspective
- When using such quotes, add clarifying context
- BAD: "I put four wounds on your [UNIT:Battle Leader]" - unclear whose Battle Leader
- GOOD: "I put four wounds on your [UNIT:Battle Leader]" (Ben's Space Wolves Battle Leader)
- Add parenthetical clarification for pronoun referents
```

---

## 45. Undefined Unit References

```markdown
### Identify All Units Explicitly
- Do NOT use informal unit descriptions without identifying the actual unit
- BAD: "your priest" - which unit is the "priest"? Homunculus? Chaplain?
- GOOD: "your [UNIT:Homunculus] (referred to as 'priest')"
- If the informal name can't be mapped to a known unit, mark as [unknown unit: "priest"]
```
