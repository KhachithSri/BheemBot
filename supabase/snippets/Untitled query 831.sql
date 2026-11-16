select
  session_id,
  pii_types,
  pii_count,
  original_content,
  masked_content,
  timestamp
from privacy_events
order by timestamp desc
limit 20;