-- Add temperature column to activity_samples for better activity visualization

alter table public.activity_samples
add column temperature numeric;
