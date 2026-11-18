# BUILD ARENA

A 1v1 ranked duel game playable in a browser (HTML + JS + CSS, no build step required).
Features include wall construction and editing (similar to Fortnite), neutral camps that grant "souls," leveling and abilities (inspired by Deadlock), and core-towers (akin to the Ancients in Dota). Uses Supabase for Elo ratings, user accounts, and matchmaking.

## Quick start with no server (Game with bots)

```bash
python3 -m http.server 8080     
http://localhost:8080
```
While `config.js` is not filled, game will work in mode «Training with a bot», online is off.
