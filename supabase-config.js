// Initialize Supabase client
const supabaseUrl = SUPABASE_CONFIG.url
const supabaseKey = SUPABASE_CONFIG.key
const supabase = supabaseClient.createClient(supabaseUrl, supabaseKey)

// Database service
const DB = {
    async createUser(userData) {
        try {
            const { data, error } = await supabase
                .from('users')
                .insert([{
                    name: userData.name,
                    created_events: [],
                    interested_events: []
                }])
                .select()
            
            if (error) {
                console.error('Error creating user:', error)
                throw error
            }
            return data[0]
        } catch (error) {
            console.error('Error in createUser:', error)
            throw error
        }
    },

    async getUserByName(name) {
        const { data, error } = await supabase
            .from('users')
            .select()
            .eq('name', name)
            .single()
        
        if (error && error.code !== 'PGRST116') throw error
        return data
    },

    async createEvent(eventData) {
        const { data, error } = await supabase
            .from('events')
            .insert([{
                title: eventData.title,
                description: eventData.description,
                date: eventData.date,
                time: eventData.time,
                category: eventData.category,
                lat: eventData.lat,
                lng: eventData.lng,
                creator_id: eventData.creator,
                creator_name: eventData.creatorName,
                interested_users: []
            }])
            .select()
        
        if (error) throw error
        return data[0]
    },

    async getEvents() {
        const { data, error } = await supabase
            .from('events')
            .select()
        
        if (error) throw error
        return data
    },

    async updateUserEvents(userId, updates) {
        const { data, error } = await supabase
            .from('users')
            .update(updates)
            .eq('id', userId)
            .select()
        
        if (error) throw error
        return data[0]
    },

    async showInterest(eventId, userId, interested) {
        const { data: event, error: eventError } = await supabase
            .from('events')
            .select('interested_users')
            .eq('id', eventId)
            .single()

        if (eventError) throw eventError

        let interestedUsers = event.interested_users || []
        
        if (interested) {
            interestedUsers.push(userId)
        } else {
            interestedUsers = interestedUsers.filter(id => id !== userId)
        }

        const { error: updateError } = await supabase
            .from('events')
            .update({ interested_users: interestedUsers })
            .eq('id', eventId)

        if (updateError) throw updateError
    },

    async signUp(email, password, name) {
        try {
            console.log('Attempting signup with:', { email, name });

            // Store the name for later use after email confirmation
            localStorage.setItem('pendingUserName', name);

            // Use the base URL
            const redirectTo = 'https://luisltferreira.github.io/climate-Web-App/';
            
            console.log('Redirect URL:', redirectTo); // Debug log
            
            // Try to sign up the user
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: { name },
                    emailRedirectTo: redirectTo // Use base URL only
                }
            });

            console.log('Signup response:', { authData, authError });

            if (authError) {
                console.error('Signup error:', authError);
                throw authError;
            }

            if (!authData?.user) {
                console.error('No user data received');
                throw new Error('Failed to create user account');
            }

            // Don't create profile here - wait for email confirmation
            return {
                needsEmailConfirmation: true,
                email: email,
                message: `Verification email sent to ${email}. Please check your inbox and spam folder. The link will redirect you back to this page.`
            };

        } catch (error) {
            console.error('Signup process error:', error);
            localStorage.removeItem('pendingUserName');
            throw error;
        }
    },

    async login(email, password) {
        try {
            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (authError) {
                throw new Error(authError.message.includes('Invalid login credentials') 
                    ? 'Email or password is incorrect' 
                    : authError.message);
            }

            if (!authData?.user) {
                throw new Error('No user data received during login');
            }

            // Get or create user profile
            const { data: profiles } = await supabase
                .from('users')
                .select('*')
                .eq('id', authData.user.id);

            if (!profiles?.length) {
                return await supabase
                    .from('users')
                    .insert({
                        id: authData.user.id,
                        name: authData.user.user_metadata?.name || 'Anonymous',
                        created_events: [],
                        interested_events: []
                    })
                    .select()
                    .single()
                    .then(({ data }) => data);
            }

            return profiles[0];

        } catch (error) {
            throw error;
        }
    },

    async logout() {
        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
        } catch (error) {
            console.error('Error during logout:', error);
            throw error;
        }
    },

    async handleEmailConfirmation(name) {
        try {
            const hashParams = new URLSearchParams(window.location.hash.substring(1));
            const accessToken = hashParams.get('access_token');
            const refreshToken = hashParams.get('refresh_token');

            if (!accessToken || !refreshToken) {
                throw new Error('Invalid verification link');
            }

            // Set the session with the tokens
            const { data: { session }, error: setSessionError } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken
            });

            if (setSessionError || !session?.user) {
                throw setSessionError || new Error('No user found in session');
            }

            try {
                // Check if profile exists and create if it doesn't
                const { data: profile, error: profileError } = await supabase
                    .from('users')
                    .select('*')
                    .eq('id', session.user.id)
                    .single();

                if (profile) return profile;

                // Create new profile
                return await supabase
                    .from('users')
                    .insert({
                        id: session.user.id,
                        name: name || session.user.user_metadata?.name || 'Anonymous',
                        created_events: [],
                        interested_events: []
                    })
                    .select()
                    .single()
                    .then(({ data }) => data);

            } catch (dbError) {
                throw new Error('Failed to create or retrieve user profile');
            }
        } catch (error) {
            if (error.message?.includes('Invalid verification')) {
                throw new Error('Invalid verification link. Please try logging in directly.');
            }
            if (error.message?.includes('JWT expired')) {
                throw new Error('Verification link has expired. Please request a new one.');
            }
            throw new Error('Failed to complete email verification. Please try logging in.');
        }
    }
}