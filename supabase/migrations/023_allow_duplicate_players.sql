-- 023_allow_duplicate_players.sql
-- Drop the uniqueness constraint on team_players (team_id, player_id, matchday)
-- This allows duplicate players in the user's team lineup (for mistakes/sanctions)

ALTER TABLE team_players
DROP CONSTRAINT IF EXISTS team_players_team_player_matchday_unique;
