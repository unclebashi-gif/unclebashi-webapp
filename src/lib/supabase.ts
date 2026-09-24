import { createClient } from '@supabase/supabase-js';


// Initialize database client
const supabaseUrl = 'https://durdzpgeupknipeixlik.databasepad.com';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IjZlYzNhZTY0LWJkYjAtNDcyMy1hMWUzLTRhYmVhNWE5YjI3MyJ9.eyJwcm9qZWN0SWQiOiJkdXJkenBnZXVwa25pcGVpeGxpayIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzY5ODczNzg4LCJleHAiOjIwODUyMzM3ODgsImlzcyI6ImZhbW91cy5kYXRhYmFzZXBhZCIsImF1ZCI6ImZhbW91cy5jbGllbnRzIn0.osaA10q296Slaj09wbEQI97stu0qyXT9cxnFM2NfKro';
const supabase = createClient(supabaseUrl, supabaseKey);


export { supabase };