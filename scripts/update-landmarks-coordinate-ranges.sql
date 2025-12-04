-- Update coordinate range constraints for new map size (4096 x 2728)
ALTER TABLE landmarks DROP CONSTRAINT IF EXISTS landmarks_map_x_check;
ALTER TABLE landmarks DROP CONSTRAINT IF EXISTS landmarks_map_y_check;

ALTER TABLE landmarks ADD CONSTRAINT landmarks_map_x_check CHECK (map_x >= 0 AND map_x <= 4096);
ALTER TABLE landmarks ADD CONSTRAINT landmarks_map_y_check CHECK (map_y >= 0 AND map_y <= 2728);

