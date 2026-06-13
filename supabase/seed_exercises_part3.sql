-- BICEPS
insert into public.exercises (name, primary_muscle, movement_pattern, equipment, progression_eligible, suggested_rep_min, suggested_rep_max) values
('Barbell Curls', 'arms', 'isolation', 'barbell', true, 6, 15),
('EZ Bar Curls', 'arms', 'isolation', 'barbell', true, 6, 15),
('Spider Curls', 'arms', 'isolation', 'barbell', true, 8, 15),
('Barbell Reverse Curls', 'arms', 'isolation', 'barbell', true, 8, 15),
('DB Hammer Curls', 'arms', 'isolation', 'dumbbell', true, 8, 15),
('DB Incline Curls', 'arms', 'isolation', 'dumbbell', true, 8, 15),
('DB Incline Hammer Curls', 'arms', 'isolation', 'dumbbell', true, 8, 15),
('DB Preacher Curls', 'arms', 'isolation', 'dumbbell', true, 8, 15),
('Machine Preacher Curls', 'arms', 'isolation', 'machine', true, 8, 15),
('Cable Rope Curls', 'arms', 'isolation', 'cable', true, 10, 20),
('Cable Curls', 'arms', 'isolation', 'cable', true, 10, 20),
('Single Arm Cable Curl', 'arms', 'isolation', 'cable', true, 10, 20),
('Towel KB Curl', 'arms', 'isolation', 'kettlebell', false, 8, 15),
('Seated Curls', 'arms', 'isolation', 'dumbbell', true, 8, 15),
('Plate Curls', 'arms', 'isolation', 'bodyweight', false, 10, 20),
('1+1/4 DB Hammer Curls', 'arms', 'isolation', 'dumbbell', true, 8, 15),
('Zottman Curls', 'arms', 'isolation', 'dumbbell', true, 8, 15),
('Machine Biceps Curl', 'arms', 'isolation', 'machine', true, 8, 15);

-- TRICEPS
insert into public.exercises (name, primary_muscle, movement_pattern, equipment, progression_eligible, suggested_rep_min, suggested_rep_max) values
('Close Grip Push Up', 'arms', 'horizontal_press', 'bodyweight', false, 8, 20),
('Barbell Floor Press', 'arms', 'horizontal_press', 'barbell', true, 4, 10),
('Lying DB Triceps Extension', 'arms', 'isolation', 'dumbbell', true, 8, 15),
('DB Lateral Triceps Extension', 'arms', 'isolation', 'dumbbell', true, 8, 15),
('Cable Rope Pushdown', 'arms', 'isolation', 'cable', true, 10, 20),
('Cable Bar Pushdown', 'arms', 'isolation', 'cable', true, 10, 20),
('JM Press', 'arms', 'horizontal_press', 'barbell', true, 6, 12),
('PJR Pullovers', 'arms', 'isolation', 'dumbbell', true, 8, 15),
('Cable Overhead Triceps Extension', 'arms', 'isolation', 'cable', true, 10, 20),
('Inverted Skull Crusher', 'arms', 'isolation', 'barbell', true, 6, 12),
('Banded Triceps Pushdown', 'arms', 'isolation', 'bands', false, 15, 30),
('Close Grip Incline Press', 'arms', 'horizontal_press', 'barbell', true, 6, 12),
('Paused DB Triceps Extension', 'arms', 'isolation', 'dumbbell', true, 8, 15),
('Dips (Triceps Focus)', 'arms', 'horizontal_press', 'bodyweight', true, 6, 15),
('Skull Crushers', 'arms', 'isolation', 'barbell', true, 6, 12),
('Smith Close Grip Bench Press', 'arms', 'horizontal_press', 'smith_machine', true, 6, 12),
('Machine Triceps Extension', 'arms', 'isolation', 'machine', true, 10, 20);

-- CALVES
insert into public.exercises (name, primary_muscle, movement_pattern, equipment, progression_eligible, suggested_rep_min, suggested_rep_max) values
('Machine Calf Raise', 'calves', 'isolation', 'machine', true, 10, 20),
('Seated Calf Raise', 'calves', 'isolation', 'machine', true, 10, 20),
('Barbell Calf Raise', 'calves', 'isolation', 'barbell', true, 10, 20),
('Rockback Calf Raise', 'calves', 'isolation', 'bodyweight', false, 15, 30),
('Donkey Calf Raise', 'calves', 'isolation', 'machine', true, 10, 20),
('DB Calf Raise', 'calves', 'isolation', 'dumbbell', true, 12, 20);

-- GLUTES
insert into public.exercises (name, primary_muscle, movement_pattern, equipment, progression_eligible, suggested_rep_min, suggested_rep_max) values
('Barbell Hip Thrust', 'glutes', 'hinge', 'barbell', true, 8, 15),
('45 Degree Back Extension', 'glutes', 'hinge', 'machine', true, 10, 20),
('Frog Pumps', 'glutes', 'isolation', 'bodyweight', false, 15, 30),
('Cable Kickbacks', 'glutes', 'isolation', 'cable', true, 12, 20),
('Machine Kickbacks', 'glutes', 'isolation', 'machine', true, 12, 20),
('Machine Abduction', 'glutes', 'isolation', 'machine', true, 12, 20),
('1+1/4 Hip Thrust', 'glutes', 'hinge', 'barbell', true, 8, 15),
('Pause Hip Thrust', 'glutes', 'hinge', 'barbell', true, 8, 15),
('Triple Pulse Hip Thrust', 'glutes', 'hinge', 'barbell', false, 8, 15),
('B-Stance Hip Thrust', 'glutes', 'hinge', 'barbell', true, 8, 15),
('Banded Lateral Shuffle', 'glutes', 'isolation', 'bands', false, 1, 1),
('DB Walking Lunges (Long Stride)', 'glutes', 'lunge', 'dumbbell', false, 10, 20),
('Glute Bridge Walkouts', 'glutes', 'hinge', 'bodyweight', false, 8, 15),
('Glute Bridge March', 'glutes', 'hinge', 'bodyweight', false, 10, 20),
('Cable Pull Throughs', 'glutes', 'hinge', 'cable', true, 12, 20),
('Pulse Hip Thrusts', 'glutes', 'hinge', 'barbell', false, 15, 30),
('B-Stance RDL', 'glutes', 'hinge', 'barbell', true, 8, 15),
('Banded Hip Abduction', 'glutes', 'isolation', 'bands', false, 15, 30),
('Side Lying Hip Raise', 'glutes', 'isolation', 'bodyweight', false, 12, 20),
('Standing Abduction', 'glutes', 'isolation', 'cable', true, 12, 20),
('High Box Step Up', 'glutes', 'lunge', 'dumbbell', true, 8, 15);
