
-- Delete orphaned truncated entities (no references remain)
-- These are duplicates with incorrect names that have been merged

DELETE FROM entities WHERE id IN (
  'efbeeea1-5ca5-4efe-ad13-0c10ca76da02', -- Bodecker Partner
  '9329c3f8-1dde-414b-9e52-9ad15838af50', -- Hi3G Acces
  '6e5862c7-0ccb-4e73-80e1-da093d58714e', -- Civil Rights Defender
  '1f8506e2-26d5-4411-b8f2-b6b44ef8f3d2', -- Myndigheten för vårdanaly
  '0cb9afc5-41d3-420e-9cd2-0cf96503e387', -- Myndigheten för totalförsvarsanaly
  'd56ee252-085a-4bc6-b927-46bad9c6978d', -- Tillväxtanaly
  '8467df03-f10a-4714-9fe9-b6af00d85953', -- Myndigheten för kulturanaly
  '39df389c-9234-4d0f-8fd8-208287c00953', -- Myndigheten för vård- och omsorgsanaly
  '76c0ee31-c10a-40c9-bbe6-14bd143146d3', -- Stiftelsen Friend
  '06f23139-ee50-47a2-bd5a-471ea7d83957', -- MKB Fastighet
  '36d67b6c-e372-487c-bce9-7e94d31f2abc', -- Expertgruppen för biståndsanaly
  'b2f8b1c9-6537-46d6-a8f2-89d546dc4403', -- Friend
  'ddd1e61a-a78f-4e3a-9ecb-d3ee79efcd56', -- Malmö Redhawk
  '36984d0a-57b5-4e1d-b093-4b3224aba999'  -- Trafikanaly
);
