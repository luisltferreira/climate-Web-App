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
            const { data: profiles, error: profileError } = await supabase
                .from('users')
                .select('*')
                .eq('id', authData.user.id);

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

            // Handle multiple or no profiles
            if (!profiles || profiles.length === 0) {
                console.log('No profile found, creating new one');
                // Create new profile
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
                return newProfile;
            }

            if (profiles.length > 1) {
                console.warn('Multiple profiles found, using first one:', profiles);
            }

            // Use the first profile found
            const profile = profiles[0];
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
            // First try to exchange the token from the URL hash
            const hashParams = new URLSearchParams(window.location.hash.substring(1));
            const accessToken = hashParams.get('access_token');
            const refreshToken = hashParams.get('refresh_token');
            
            console.log('Auth tokens from URL:', { accessToken: !!accessToken, refreshToken: !!refreshToken });

            if (accessToken && refreshToken) {
                // Set the session with the tokens
                const { data: { session }, error: setSessionError } = await supabase.auth.setSession({
                    access_token: accessToken,
                    refresh_token: refreshToken
                });

                if (setSessionError) {
                    console.error('Error setting session:', setSessionError);
                    throw setSessionError;
                }

                if (!session?.user) {
                    throw new Error('No user found in session after setting tokens');
                }

                console.log('Session established:', session.user);

                // Check if profile already exists
                const { data: existingProfile, error: checkError } = await supabase
                    .from('users')
                    .select()
                    .eq('id', session.user.id)
                    .maybeSingle(); // Use maybeSingle instead of single

                if (checkError) {
                    console.error('Error checking existing profile:', checkError);
                    throw checkError;
                }

                if (existingProfile) {
                    console.log('Profile already exists:', existingProfile);
                    return existingProfile;
                }

                // Create user profile if it doesn't exist
                const { data: profile, error: profileError } = await supabase
                    .from('users')
                    .insert([{
                        id: session.user.id,
                        name: name || session.user.user_metadata?.name || 'Anonymous',
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
            } else {
                throw new Error('No authentication tokens found in URL');
            }

        } catch (error) {
            console.error('Email confirmation handling error:', error);
            // Add more specific error messages
            if (error.message?.includes('No authentication tokens')) {
                throw new Error('Invalid verification link. Please try logging in directly.');
            }
            if (error.message?.includes('JWT expired')) {
                throw new Error('Verification link has expired. Please request a new one.');
            }
            throw error;
        }
    }
}