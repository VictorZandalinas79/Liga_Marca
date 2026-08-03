import sys
sys.path.append('frontend-web')
from trigger_descarga_eventos import MatchEventDownloader

downloader = MatchEventDownloader('57dotnff3xaafnxfltzt4czdg', '57dotnff3xaafnxfltzt4czdg')
downloader.upload_to_supabase = lambda *args, **kwargs: None

# Override to print matches
old_handle_save = downloader._handle_save
def custom_handle_save(event, current_min):
    total_sec = event.get('timeMin', 0) * 60 + event.get('timeSec', 0)
    pid = event.get('playerId')
    print(f"\nSAVE by {pid} at seq {downloader.event_seq} (time {total_sec}s)")
    print(f"Recent shots buffer length: {len(downloader.recent_shots)}")
    for shot_seq, sx, sy in downloader.recent_shots:
        print(f"  Shot in buffer: seq {shot_seq}, x={sx}, y={sy}")
    
    # Run original logic to see what it picks
    closest_shot = None
    min_diff = 9999
    for shot_seq, sx, sy in downloader.recent_shots:
        seq_diff = downloader.event_seq - shot_seq
        if 0 < seq_diff <= 4:
            if seq_diff < min_diff:
                min_diff = seq_diff
                closest_shot = (sx, sy)
    
    if closest_shot:
        print(f"  --> MATCHED with shot at x={closest_shot[0]}, y={closest_shot[1]} (seq_diff={min_diff})")
    else:
        print(f"  --> NO MATCH FOUND")
    
    old_handle_save(event, current_min)

downloader._handle_save = custom_handle_save
downloader.run()

