import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Camera, Check, X, Upload, Image as ImageIcon, Scissors, Loader2, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Cropper, { Area } from 'react-easy-crop';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';
import { apiUrl } from '../lib/apiOrigin';

// Helper function to create the cropped image
const getCroppedImg = async (imageSrc: string, pixelCrop: Area): Promise<string> => {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', (error) => reject(error));
    img.setAttribute('crossOrigin', 'anonymous');
    img.src = imageSrc;
  });

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) return '';

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  return canvas.toDataURL('image/jpeg');
};

export default function EditProfilePage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const { user, profile, refreshProfile } = useAuth();
  const [formData, setFormData] = useState({
    username: '',
    displayName: '',
    bio: '',
    avatar: null as string | null,
  });

  useEffect(() => {
    if (profile) {
      setFormData({
        username: profile.username || '',
        displayName: profile.full_name || '',
        bio: profile.bio || '',
        avatar: profile.avatar_url || `https://picsum.photos/seed/${profile.id}/200/200`,
      });
    }
  }, [profile]);

  const [isSaving, setIsSaving] = useState(false);
  const [showSourceOptions, setShowSourceOptions] = useState(false);
  
  // Cropper state
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const handleSave = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      console.log('Saving profile for user:', user.id, formData);
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          username: formData.username,
          display_name: formData.displayName,
          bio: formData.bio,
          avatar_url: formData.avatar,
        });
      
      if (error) {
        console.error('Supabase update error:', error);
        throw error;
      }
      
      // Sync with local DB immediately
      try {
        console.log('DEBUG: Syncing profile to local DB:', formData);
        const syncRes = await fetch(apiUrl('/api/users/sync'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: user.id,
            username: formData.username,
            full_name: formData.displayName,
            avatar: formData.avatar,
            bio: formData.bio
          })
        });
        if (!syncRes.ok) {
          console.error(`DEBUG: Sync API error: ${syncRes.status}`);
        } else {
          console.log('DEBUG: Sync successful');
        }
      } catch (syncErr) {
        console.error('DEBUG: Failed to sync after save:', syncErr);
      }
      
      console.log('Profile saved successfully, refreshing...');
      await refreshProfile();
      alert('Profile updated successfully!');
      navigate('/profile');
    } catch (err: any) {
      console.error('Error updating profile:', err);
      alert(err.message || 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const onCropComplete = useCallback((_: Area, b: Area) => {
    setCroppedAreaPixels(b);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        setImageToCrop(reader.result as string);
        setShowSourceOptions(false);
      });
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const applyCrop = async () => {
    if (imageToCrop && croppedAreaPixels) {
      try {
        const croppedImage = await getCroppedImg(imageToCrop, croppedAreaPixels);
        setFormData(prev => ({ ...prev, avatar: croppedImage }));
        setImageToCrop(null);
      } catch (e) {
        console.error(e);
      }
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto p-4 lg:p-8 pb-12"
    >
      <div className="flex items-center justify-between mb-8">
        <button 
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-gray-500 hover:text-indigo-600 transition-colors group"
        >
          <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
          <span className="font-bold">Back</span>
        </button>
        <h1 className="text-xl font-bold">Edit Profile</h1>
        <div className="w-10" />
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 lg:p-8 border border-gray-100 dark:border-gray-800 shadow-sm">
        {/* Avatar Edit */}
        <div className="flex flex-col items-center mb-8">
          <div className="relative group cursor-pointer" onClick={() => setShowSourceOptions(true)}>
            <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-indigo-500/20 bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              {formData.avatar ? (
                <img src={formData.avatar} alt="Profile" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
              ) : (
                <User size={48} className="text-gray-400" />
              )}
            </div>
            <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera className="text-white" size={32} />
            </div>
            <div className="absolute bottom-0 right-0 bg-indigo-600 text-white p-2 rounded-full border-4 border-white dark:border-black shadow-lg">
              <Camera size={16} />
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-4">Click to change profile picture</p>
        </div>

        {/* Hidden Inputs */}
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept="image/*" 
          onChange={handleFileChange} 
        />
        <input 
          type="file" 
          ref={cameraInputRef} 
          className="hidden" 
          accept="image/*" 
          capture="user" 
          onChange={handleFileChange} 
        />

        {/* Form Fields */}
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Display Name</label>
            <input 
              type="text" 
              value={formData.displayName}
              onChange={(e) => setFormData(prev => ({ ...prev, displayName: e.target.value }))}
              className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl py-3 px-4 focus:ring-2 focus:ring-indigo-500 transition-all"
              placeholder="Your display name"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Username</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">@</span>
              <input 
                type="text" 
                value={formData.username}
                onChange={(e) => setFormData(prev => ({ ...prev, username: (e.target.value || '').toLowerCase().replace(/\s/g, '_') }))}
                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl py-3 pl-8 pr-4 focus:ring-2 focus:ring-indigo-500 transition-all"
                placeholder="username"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Bio</label>
            <textarea 
              value={formData.bio}
              onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
              rows={4}
              className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl py-3 px-4 focus:ring-2 focus:ring-indigo-500 transition-all resize-none"
              placeholder="Tell us about yourself..."
            />
          </div>

          <div className="pt-4 flex gap-4">
            <button 
              onClick={() => navigate(-1)}
              className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 py-4 rounded-2xl font-bold hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
            >
              Cancel
            </button>
            <button 
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 bg-indigo-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check size={20} />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Source Selection Modal */}
      <AnimatePresence>
        {showSourceOptions && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSourceOptions(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-white dark:bg-gray-900 w-full max-w-xs rounded-3xl p-6 shadow-2xl border border-gray-100 dark:border-gray-800"
            >
              <h3 className="text-xl font-bold mb-6 text-center">Change Photo</h3>
              <div className="space-y-3">
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors group"
                >
                  <div className="w-10 h-10 rounded-xl bg-white dark:bg-gray-700 flex items-center justify-center shadow-sm group-hover:text-indigo-600">
                    <ImageIcon size={20} />
                  </div>
                  <span className="font-bold">Upload Photo</span>
                </button>
                <button 
                  onClick={() => cameraInputRef.current?.click()}
                  className="w-full flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors group"
                >
                  <div className="w-10 h-10 rounded-xl bg-white dark:bg-gray-700 flex items-center justify-center shadow-sm group-hover:text-indigo-600">
                    <Camera size={20} />
                  </div>
                  <span className="font-bold">Take Photo</span>
                </button>
                <button 
                  onClick={() => setShowSourceOptions(false)}
                  className="w-full py-3 text-gray-500 font-bold text-sm"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Cropper Modal */}
      <AnimatePresence>
        {imageToCrop && (
          <div className="fixed inset-0 z-[110] bg-black flex flex-col">
            <div className="p-4 flex items-center justify-between text-white z-10">
              <button onClick={() => setImageToCrop(null)} className="p-2 hover:bg-white/10 rounded-full">
                <X size={24} />
              </button>
              <h3 className="font-bold">Crop Photo</h3>
              <button onClick={applyCrop} className="bg-indigo-600 text-white px-6 py-2 rounded-full font-bold shadow-lg shadow-indigo-500/20">
                Done
              </button>
            </div>
            
            <div className="flex-1 relative">
              <Cropper
                image={imageToCrop}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
              />
            </div>

            <div className="p-8 bg-black/50 backdrop-blur-md z-10">
              <div className="max-w-xs mx-auto flex items-center gap-4">
                <Scissors size={20} className="text-white/40" />
                <input
                  type="range"
                  value={zoom}
                  min={1}
                  max={3}
                  step={0.1}
                  aria-labelledby="Zoom"
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
