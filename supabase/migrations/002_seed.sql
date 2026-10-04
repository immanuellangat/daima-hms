-- =====================================================================
-- DAIMA Health Managing System - reference data (run after 001_schema.sql)
-- =====================================================================

-- ---------- symptoms ----------
insert into symptoms (name, category) values
 ('Fever','General'),('Chills','General'),('Fatigue','General'),('Weight loss','General'),('Night sweats','General'),('Loss of appetite','General'),
 ('Headache','Neurological'),('Dizziness','Neurological'),('Neck stiffness','Neurological'),('Confusion','Neurological'),
 ('Cough','Respiratory'),('Shortness of breath','Respiratory'),('Wheezing','Respiratory'),('Sore throat','Respiratory'),('Runny nose','Respiratory'),('Chest pain','Respiratory'),('Coughing blood','Respiratory'),
 ('Nausea','Gastrointestinal'),('Vomiting','Gastrointestinal'),('Diarrhoea','Gastrointestinal'),('Abdominal pain','Gastrointestinal'),('Constipation','Gastrointestinal'),('Heartburn','Gastrointestinal'),('Blood in stool','Gastrointestinal'),
 ('Painful urination','Urinary'),('Frequent urination','Urinary'),('Excessive thirst','Urinary'),('Flank pain','Urinary'),
 ('Joint pain','Musculoskeletal'),('Muscle aches','Musculoskeletal'),('Back pain','Musculoskeletal'),
 ('Rash','Skin'),('Itching','Skin'),('Skin lesions','Skin'),
 ('Vaginal discharge','Reproductive'),('Missed period','Reproductive'),('Pelvic pain','Reproductive'),
 ('Ear pain','ENT'),('Eye redness','Eye'),('Blurred vision','Eye'),
 ('Swollen legs','Cardiovascular'),('Palpitations','Cardiovascular'),('Pale skin','General');

-- ---------- conditions ----------
insert into conditions (name, icd_code) values
 ('Malaria','B54'),('Typhoid fever','A01.0'),('Upper respiratory tract infection','J06.9'),('Pneumonia','J18.9'),
 ('Tuberculosis','A15.9'),('Asthma','J45.9'),('Gastroenteritis','A09'),('Urinary tract infection','N39.0'),
 ('Hypertension','I10'),('Type 2 diabetes mellitus','E11.9'),('Peptic ulcer disease','K27.9'),('Meningitis','G03.9'),
 ('Migraine','G43.9'),('Anaemia','D64.9'),('HIV infection','B24'),('Pregnancy','Z33'),
 ('Pelvic inflammatory disease','N73.9'),('Skin infection','L08.9'),('Allergic reaction','T78.4'),('Osteoarthritis','M19.9'),
 ('Otitis media','H66.9'),('Conjunctivitis','H10.9'),('Heart failure','I50.9'),('Dehydration','E86.0'),('Musculoskeletal strain','M62.8');

-- ---------- symptom -> condition rules (weight 1-3 = how strongly the symptom points to it) ----------
insert into symptom_conditions (symptom_id, condition_id, weight)
select s.id, c.id, w.weight from (values
 ('Fever','Malaria',3),('Chills','Malaria',3),('Headache','Malaria',2),('Muscle aches','Malaria',1),('Vomiting','Malaria',1),('Fatigue','Malaria',1),('Night sweats','Malaria',1),
 ('Fever','Typhoid fever',3),('Abdominal pain','Typhoid fever',2),('Headache','Typhoid fever',1),('Constipation','Typhoid fever',1),('Diarrhoea','Typhoid fever',1),('Loss of appetite','Typhoid fever',2),
 ('Cough','Upper respiratory tract infection',2),('Sore throat','Upper respiratory tract infection',3),('Runny nose','Upper respiratory tract infection',3),('Fever','Upper respiratory tract infection',1),('Headache','Upper respiratory tract infection',1),
 ('Cough','Pneumonia',3),('Fever','Pneumonia',2),('Shortness of breath','Pneumonia',3),('Chest pain','Pneumonia',2),('Chills','Pneumonia',1),
 ('Cough','Tuberculosis',3),('Coughing blood','Tuberculosis',3),('Night sweats','Tuberculosis',3),('Weight loss','Tuberculosis',3),('Fever','Tuberculosis',1),('Fatigue','Tuberculosis',1),
 ('Wheezing','Asthma',3),('Shortness of breath','Asthma',3),('Cough','Asthma',2),('Chest pain','Asthma',1),
 ('Diarrhoea','Gastroenteritis',3),('Vomiting','Gastroenteritis',3),('Nausea','Gastroenteritis',2),('Abdominal pain','Gastroenteritis',2),('Fever','Gastroenteritis',1),
 ('Painful urination','Urinary tract infection',3),('Frequent urination','Urinary tract infection',3),('Flank pain','Urinary tract infection',2),('Fever','Urinary tract infection',1),('Pelvic pain','Urinary tract infection',1),
 ('Headache','Hypertension',2),('Dizziness','Hypertension',2),('Blurred vision','Hypertension',2),('Chest pain','Hypertension',1),('Palpitations','Hypertension',1),
 ('Excessive thirst','Type 2 diabetes mellitus',3),('Frequent urination','Type 2 diabetes mellitus',3),('Blurred vision','Type 2 diabetes mellitus',2),('Fatigue','Type 2 diabetes mellitus',1),('Weight loss','Type 2 diabetes mellitus',1),
 ('Abdominal pain','Peptic ulcer disease',3),('Heartburn','Peptic ulcer disease',3),('Nausea','Peptic ulcer disease',2),('Blood in stool','Peptic ulcer disease',2),('Vomiting','Peptic ulcer disease',1),
 ('Fever','Meningitis',2),('Headache','Meningitis',3),('Neck stiffness','Meningitis',3),('Confusion','Meningitis',3),('Vomiting','Meningitis',1),
 ('Headache','Migraine',3),('Nausea','Migraine',2),('Vomiting','Migraine',1),('Blurred vision','Migraine',1),('Dizziness','Migraine',1),
 ('Fatigue','Anaemia',3),('Pale skin','Anaemia',3),('Dizziness','Anaemia',2),('Shortness of breath','Anaemia',2),('Palpitations','Anaemia',2),
 ('Weight loss','HIV infection',2),('Fever','HIV infection',1),('Night sweats','HIV infection',2),('Fatigue','HIV infection',1),('Skin lesions','HIV infection',1),('Diarrhoea','HIV infection',1),
 ('Missed period','Pregnancy',3),('Nausea','Pregnancy',2),('Vomiting','Pregnancy',1),('Fatigue','Pregnancy',1),
 ('Pelvic pain','Pelvic inflammatory disease',3),('Vaginal discharge','Pelvic inflammatory disease',3),('Fever','Pelvic inflammatory disease',1),('Painful urination','Pelvic inflammatory disease',1),
 ('Skin lesions','Skin infection',3),('Rash','Skin infection',2),('Itching','Skin infection',2),('Fever','Skin infection',1),
 ('Rash','Allergic reaction',3),('Itching','Allergic reaction',3),('Wheezing','Allergic reaction',1),('Runny nose','Allergic reaction',1),
 ('Joint pain','Osteoarthritis',3),('Back pain','Osteoarthritis',2),('Muscle aches','Osteoarthritis',1),
 ('Ear pain','Otitis media',3),('Fever','Otitis media',1),
 ('Eye redness','Conjunctivitis',3),('Itching','Conjunctivitis',1),
 ('Shortness of breath','Heart failure',3),('Swollen legs','Heart failure',3),('Fatigue','Heart failure',2),('Palpitations','Heart failure',1),('Cough','Heart failure',1),
 ('Diarrhoea','Dehydration',1),('Vomiting','Dehydration',1),('Excessive thirst','Dehydration',2),('Dizziness','Dehydration',2),('Fatigue','Dehydration',1),
 ('Back pain','Musculoskeletal strain',3),('Muscle aches','Musculoskeletal strain',3),('Joint pain','Musculoskeletal strain',1)
) as w(symptom, condition, weight)
join symptoms s on s.name = w.symptom
join conditions c on c.name = w.condition;

-- ---------- laboratory catalogue ----------
insert into lab_tests (name, category, price, unit, reference_range) values
 ('Full Blood Count (FBC)','Blood',800,null,null),
 ('Haemoglobin','Blood',300,'g/dL','12.0 - 17.5'),
 ('Erythrocyte Sedimentation Rate (ESR)','Blood',400,'mm/hr','0 - 20'),
 ('Blood Group & Rhesus','Blood',500,null,null),
 ('Random Blood Sugar','Blood',250,'mmol/L','3.9 - 7.8'),
 ('Fasting Blood Sugar','Blood',250,'mmol/L','3.9 - 5.5'),
 ('HbA1c','Blood',1500,'%','4.0 - 5.6'),
 ('Liver Function Tests','Blood',2000,null,null),
 ('Renal Function Tests (U&E/Creatinine)','Blood',1800,null,null),
 ('Lipid Profile','Blood',2200,'mmol/L',null),
 ('Widal Test (Typhoid)','Blood',600,null,'Negative'),
 ('Brucella Test','Blood',700,null,'Negative'),
 ('Malaria Rapid Test (mRDT)','Malaria',300,null,'Negative'),
 ('Malaria Blood Slide (BS)','Malaria',350,null,'No parasites seen'),
 ('HIV Rapid Test','HIV',300,null,'Non-reactive'),
 ('HIV Viral Load','HIV',4500,'copies/mL',null),
 ('CD4 Count','HIV',2500,'cells/µL','500 - 1500'),
 ('Pregnancy Test (Urine hCG)','Pregnancy',200,null,'Negative'),
 ('Serum Beta-hCG','Pregnancy',1200,'mIU/mL',null),
 ('Urinalysis','Urine',350,null,null),
 ('Urine Microscopy, Culture & Sensitivity','Urine',1200,null,null),
 ('Stool Microscopy (O&P)','Stool',350,null,'No ova or parasites'),
 ('Stool Culture & Sensitivity','Stool',1200,null,null),
 ('Stool Occult Blood','Stool',400,null,'Negative'),
 ('H. pylori Antigen','Stool',900,null,'Negative'),
 ('Sputum AFB (TB)','Sputum',500,null,'Negative'),
 ('GeneXpert MTB/RIF','Sputum',2500,null,'MTB not detected'),
 ('VDRL / Syphilis Test','Serology',500,null,'Non-reactive'),
 ('Hepatitis B Surface Antigen','Serology',700,null,'Negative'),
 ('Hepatitis C Antibody','Serology',800,null,'Negative'),
 ('PSA (Prostate Specific Antigen)','Serology',1800,'ng/mL','0 - 4.0'),
 ('CRP (C-Reactive Protein)','Blood',900,'mg/L','< 5'),
 ('Thyroid Function Tests','Hormones',3000,null,null);

-- ---------- imaging catalogue ----------
insert into imaging_procedures (modality, name, price) values
 ('X-ray','Chest X-ray',1500),('X-ray','Abdominal X-ray',1800),('X-ray','Spine X-ray',2000),('X-ray','Limb X-ray',1500),('X-ray','Skull X-ray',1800),
 ('CT scan','CT Head',9000),('CT scan','CT Chest',11000),('CT scan','CT Abdomen & Pelvis',12000),
 ('MRI','MRI Brain',18000),('MRI','MRI Spine',20000),('MRI','MRI Knee',17000),
 ('Ultrasound','Obstetric Ultrasound',2500),('Ultrasound','Abdominal Ultrasound',3000),('Ultrasound','Pelvic Ultrasound',3000),('Ultrasound','Thyroid Ultrasound',3000),
 ('Other','ECG',1200),('Other','Echocardiogram',6000),('Other','Mammogram',5000),('Other','Fluoroscopy',6500);

-- ---------- medicines ----------
insert into medicines (name, generic_name, category, unit, selling_price, reorder_level, max_stock, is_supply) values
 ('Paracetamol 500mg','Paracetamol','Analgesic','tablet',5,200,2000,false),
 ('Ibuprofen 400mg','Ibuprofen','Analgesic','tablet',8,150,1500,false),
 ('Diclofenac 50mg','Diclofenac','Analgesic','tablet',10,100,1000,false),
 ('Tramadol 50mg','Tramadol','Analgesic','capsule',20,50,500,false),
 ('Amoxicillin 500mg','Amoxicillin','Antibiotic','capsule',15,300,3000,false),
 ('Amoxicillin-Clavulanate 625mg','Co-amoxiclav','Antibiotic','tablet',45,100,1000,false),
 ('Azithromycin 500mg','Azithromycin','Antibiotic','tablet',90,60,600,false),
 ('Ciprofloxacin 500mg','Ciprofloxacin','Antibiotic','tablet',25,100,1000,false),
 ('Metronidazole 400mg','Metronidazole','Antibiotic','tablet',8,150,1500,false),
 ('Doxycycline 100mg','Doxycycline','Antibiotic','capsule',12,100,1000,false),
 ('Ceftriaxone 1g Injection','Ceftriaxone','Antibiotic','vial',180,40,400,false),
 ('Artemether-Lumefantrine 20/120','Coartem','Antimalarial','tablet',60,200,2000,false),
 ('Artesunate 60mg Injection','Artesunate','Antimalarial','vial',350,20,200,false),
 ('Amlodipine 5mg','Amlodipine','Cardiovascular','tablet',10,150,1500,false),
 ('Enalapril 10mg','Enalapril','Cardiovascular','tablet',12,100,1000,false),
 ('Hydrochlorothiazide 25mg','Hydrochlorothiazide','Cardiovascular','tablet',6,100,1000,false),
 ('Atenolol 50mg','Atenolol','Cardiovascular','tablet',8,100,1000,false),
 ('Metformin 500mg','Metformin','Antidiabetic','tablet',6,300,3000,false),
 ('Glibenclamide 5mg','Glibenclamide','Antidiabetic','tablet',5,100,1000,false),
 ('Insulin (Human, 100IU/mL)','Insulin','Antidiabetic','vial',950,15,150,false),
 ('Omeprazole 20mg','Omeprazole','Gastrointestinal','capsule',10,150,1500,false),
 ('Oral Rehydration Salts','ORS','Gastrointestinal','sachet',25,100,1000,false),
 ('Loperamide 2mg','Loperamide','Gastrointestinal','capsule',12,60,600,false),
 ('Salbutamol Inhaler 100mcg','Salbutamol','Respiratory','inhaler',350,30,300,false),
 ('Prednisolone 5mg','Prednisolone','Respiratory','tablet',4,150,1500,false),
 ('Cetirizine 10mg','Cetirizine','Antihistamine','tablet',6,150,1500,false),
 ('Loratadine 10mg','Loratadine','Antihistamine','tablet',8,100,1000,false),
 ('Folic Acid 5mg','Folic acid','Supplement','tablet',3,200,2000,false),
 ('Ferrous Sulphate 200mg','Iron','Supplement','tablet',4,200,2000,false),
 ('Vitamin C 500mg','Ascorbic acid','Supplement','tablet',4,100,1000,false),
 ('Zinc Sulphate 20mg','Zinc','Supplement','tablet',5,100,1000,false),
 ('Albendazole 400mg','Albendazole','Antiparasitic','tablet',30,80,800,false),
 ('Fluconazole 150mg','Fluconazole','Antifungal','capsule',80,40,400,false),
 ('Tenofovir/Lamivudine/Dolutegravir','TLD','Antiretroviral','tablet',60,300,3000,false),
 ('Normal Saline 0.9% 500mL','Sodium chloride','IV Fluid','bag',120,50,500,false),
 ('Ringer''s Lactate 500mL','Ringer lactate','IV Fluid','bag',130,50,500,false),
 ('Disposable Syringes 5mL','Syringe','Medical Supply','piece',10,300,3000,true),
 ('Examination Gloves (box of 100)','Gloves','Medical Supply','box',650,20,200,true),
 ('Gauze Swabs (pack)','Gauze','Medical Supply','pack',90,40,400,true),
 ('IV Cannula 20G','Cannula','Medical Supply','piece',45,100,1000,true);

-- ---------- starter batches (varied so the stock colours are visible on first run) ----------
-- Quantity as a share of max_stock decides red (<10%), amber (10-20%), green (>20%).
insert into medicine_batches (medicine_id, batch_no, supplier, quantity, expiry_date, purchase_price)
select m.id, 'B' || to_char(current_date, 'YYMM') || '-' || lpad((row_number() over (order by m.name))::text, 3, '0'),
       (array['MEDS Ltd','Kenya Pharma Supplies','Cosmos Distributors','Universal Corporation'])[1 + (row_number() over (order by m.name) % 4)],
       case
         when row_number() over (order by m.name) % 7 = 0 then (m.max_stock * 0.06)::int   -- red
         when row_number() over (order by m.name) % 7 = 3 then (m.max_stock * 0.15)::int   -- amber
         else (m.max_stock * (0.35 + (row_number() over (order by m.name) % 5) * 0.12))::int  -- green
       end,
       current_date + (200 + (row_number() over (order by m.name) % 6) * 90)::int,
       round((m.selling_price * 0.6)::numeric, 2)
from medicines m;

-- one near-expiry batch and one expired batch so the expiry tracking has something to show
insert into medicine_batches (medicine_id, batch_no, supplier, quantity, expiry_date, purchase_price)
select id, 'OLD-001', 'MEDS Ltd', 40, current_date + 20, round(selling_price * 0.6, 2) from medicines where name = 'Amoxicillin 500mg';
insert into medicine_batches (medicine_id, batch_no, supplier, quantity, expiry_date, purchase_price)
select id, 'EXP-001', 'MEDS Ltd', 25, current_date - 15, round(selling_price * 0.6, 2) from medicines where name = 'Ibuprofen 400mg';
