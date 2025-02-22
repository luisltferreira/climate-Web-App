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

            // First check if user already exists
            const { data: existingUser } = await supabase.auth.getUser();
            if (existingUser?.user) {
                console.log('User already exists:', existingUser);
                throw new Error('An account with this email already exists. Please try logging in instead.');
            }

            // Update the emailRedirectTo to use your actual deployment URL
            // For local development, use localhost
            const redirectTo = window.location.origin || 'http://localhost:3000';
            
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: { name },
                    emailRedirectTo: redirectTo
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

            // Check if email is confirmed
            if (!authData.user.confirmed_at) {
                console.log('Email confirmation needed for:', email);
                return {
                    needsEmailConfirmation: true,
                    email: email,
                    message: 'Please check your email (including spam folder) for the confirmation link'
                };
            }

            // Create user profile
            const { data: userData, error: userError } = await supabase
                .from('users')
                .insert([{
                    id: authData.user.id,
                    name: name,
                    created_events: [],
                    interested_events: []
                }])
                .select()
                .single();

            if (userError) throw userError;
            return userData;
        } catch (error) {
            console.error('Signup process error:', error);
            throw error;
        }
    },

    async login(email, password) {
        try {
            console.log('Attempting login with email:', email);

            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (authError) {
                console.error('Auth error:', authError);
                if (authError.message.includes('Invalid login credentials')) {
                    throw new Error('Email or password is incorrect');
                }
                throw authError;
            }

            console.log('Login successful, getting user profile...');

            // Get user profile - Modified to handle multiple results
            const { data: userResults, error: userError } = await supabase
                .from('users')
                .select()
                .eq('id', authData.user.id);

            if (userError) {
                console.error('User profile error:', userError);
                throw userError;
            }

            // Handle case where no user profile exists
            if (!userResults || userResults.length === 0) {
                throw new Error('User profile not found');
            }

            // Return the first user profile found
            return userResults[0];

        } catch (error) {
            console.error('Login process error:', error);
            throw error;
        }
    },

    async logout() {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
    }
} 