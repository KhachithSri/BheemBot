-- Audio is live-transcribed only. Clear legacy recording metadata.
update "sessions"
set
  "audioRecordingUrl" = null,
  "audioRecordings" = '[]'::jsonb,
  "audioDuration" = null;

update "messages"
set
  "audioUrl" = null,
  "audioDurationSeconds" = null
where "audioUrl" is not null or "audioDurationSeconds" is not null;

delete from storage.objects
where bucket_id = 'recordings';
