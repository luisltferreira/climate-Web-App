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

            // Use the exact URL that matches your deployment
            const redirectTo = 'https://luisltferreira.github.io/climate-Web-App/?verification=true';
            
            console.log('Redirect URL:', redirectTo); // Debug log
            
            // Try to sign up the user
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: { name },
                    emailRedirectTo: redirectTo // Single emailRedirectTo property
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

            if (!authData?.user) {
                throw new Error('No user data received during login');
            }

            console.log('Auth successful, user ID:', authData.user.id);

            // Get user profile with more detailed error logging
            const { data: profile, error: profileError } = await supabase
                .from('users')
                .select('*')  // Explicitly select all columns
                .eq('id', authData.user.id)
                .single();

            if (profileError) {
                console.error('Profile fetch error details:', {
                    error: profileError,
                    userId: authData.user.id,
                    code: profileError.code,
                    details: profileError.details,
                    hint: profileError.hint
                });
                throw new Error(`Could not fetch user profile: ${profileError.message}`);
            }

            if (!profile) {
                console.error('No profile found for user ID:', authData.user.id);
                
                // Attempt to create profile if it doesn't exist
                try {
                    const { data: newProfile, error: createError } = await supabase
                        .from('users')
                        .insert([{
                            id: authData.user.id,
                            name: authData.user.user_metadata?.name || 'Anonymous',
                            created_events: [],
                            interested_events: []
                        }])
                        .select()
                        .single();

                    if (createError) throw createError;
                    console.log('Created new profile:', newProfile);
                    return newProfile;
                } catch (createError) {
                    console.error('Failed to create profile:', createError);
                    throw new Error('Could not create user profile');
                }
            }

            console.log('Login complete, returning profile:', profile);
            return profile;

        } catch (error) {
            console.error('Login process error:', error);
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
            // Get the current user after email confirmation
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            
            if (userError) {
                console.error('Auth error during confirmation:', userError);
                throw userError;
            }
            
            if (!user) {
                console.error('No user found during confirmation');
                throw new Error('No user found');
            }

            console.log('Handling email confirmation for user:', user);

            // Check if profile already exists
            const { data: existingProfile, error: checkError } = await supabase
                .from('users')
                .select()
                .eq('id', user.id)
                .single();

            if (checkError && !checkError.message?.includes('No rows found')) {
                console.error('Error checking existing profile:', checkError);
                throw checkError;
            }

            if (existingProfile) {
                console.log('Profile already exists:', existingProfile);
                return existingProfile;
            }

            // Create user profile
            const { data: profile, error: profileError } = await supabase
                .from('users')
                .insert([{
                    id: user.id,
                    name: name || user.user_metadata?.name || 'Anonymous',
                    created_events: [],
                    interested_events: []
                }])
                .select()
                .single();

            if (profileError) {
                console.error('Error creating profile:', profileError);
                throw profileError;
            }

            console.log('Created new profile:', profile);
            return profile;

        } catch (error) {
            console.error('Email confirmation handling error:', error);
            throw error;
        }
    }
}