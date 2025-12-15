-- Add recent_ip column to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS recent_ip TEXT;

