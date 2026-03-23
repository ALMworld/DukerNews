
import React, { useState, useEffect } from 'react';
import { View, WordEntry, VideoLesson, UserProfile, LANGUAGES, Language } from './types';
import Navbar from './components/Navbar';
import Header from './components/Header';
import ExploreView from './components/HomeView';
import WatchView from './components/WatchView';
import LearnView from './components/LearnView';
import GamesView from './components/GamesView';
import DaoView from './components/DaoView';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>(View.EXPLORE);
  const [wordbook, setWordbook] = useState<WordEntry[]>([]);
  const [ignoredWords, setIgnoredWords] = useState<string[]>([]);
  const [trackedVideos, setTrackedVideos] = useState<VideoLesson[]>([]);
  const [activeLesson, setActiveLesson] = useState<VideoLesson | null>(null);
  const [isDark, setIsDark] = useState(false);
  
  const [nativeLanguage, setNativeLanguage] = useState<Language>(LANGUAGES[0]);
  const [learningLanguage, setLearningLanguage] = useState<Language>(LANGUAGES[1]);

  const [userProfile] = useState<UserProfile>({
    name: 'Alex Johnson',
    email: 'alex@example.com',
    subscription: 'Pro',
    joinedAt: Date.now() - 1000 * 60 * 60 * 24 * 30,
    nativeLanguage: 'en',
    learningLanguage: 'es'
  });

  useEffect(() => {
    const savedWords = localStorage.getItem('youlangua_wordbook');
    const savedIgnored = localStorage.getItem('youlangua_ignored');
    const savedVideos = localStorage.getItem('youlangua_tracked_videos');
    const savedNative = localStorage.getItem('youlangua_native_lang');
    const savedLearn = localStorage.getItem('youlangua_learn_lang');
    const savedTheme = localStorage.getItem('youlangua_theme');

    if (savedWords) {
      try { setWordbook(JSON.parse(savedWords)); } catch (e) { console.error(e); }
    }
    if (savedIgnored) {
      try { setIgnoredWords(JSON.parse(savedIgnored)); } catch (e) { console.error(e); }
    }
    if (savedVideos) {
      try { setTrackedVideos(JSON.parse(savedVideos)); } catch (e) { console.error(e); }
    }
    if (savedNative) {
      const lang = LANGUAGES.find(l => l.code === savedNative);
      if (lang) setNativeLanguage(lang);
    }
    if (savedLearn) {
      const lang = LANGUAGES.find(l => l.code === savedLearn);
      if (lang) setLearningLanguage(lang);
    }
    
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      setIsDark(true);
    }
  }, []);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('youlangua_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('youlangua_theme', 'light');
    }
  }, [isDark]);

  useEffect(() => {
    localStorage.setItem('youlangua_wordbook', JSON.stringify(wordbook));
    localStorage.setItem('youlangua_ignored', JSON.stringify(ignoredWords));
    localStorage.setItem('youlangua_tracked_videos', JSON.stringify(trackedVideos));
    localStorage.setItem('youlangua_native_lang', nativeLanguage.code);
    localStorage.setItem('youlangua_learn_lang', learningLanguage.code);
  }, [wordbook, ignoredWords, trackedVideos, nativeLanguage, learningLanguage]);

  const addWord = (newWord: Omit<WordEntry, 'level'>) => {
    setWordbook(prev => {
      // Uniqueness is now defined by word + video + start time + index in sentence
      const isAlreadyAdded = prev.some(w => 
        w.word.toLowerCase() === newWord.word.toLowerCase() && 
        w.videoId === newWord.videoId &&
        w.contextStart === newWord.contextStart &&
        w.occurrenceIndex === newWord.occurrenceIndex
      );
      
      if (isAlreadyAdded) return prev;
      return [{ ...newWord, level: 'learning' }, ...prev];
    });
    setIgnoredWords(prev => prev.filter(w => w.toLowerCase() !== newWord.word.toLowerCase()));
  };

  const removeWord = (wordStr: string) => {
    // For removal, we still remove all instances of that string if requested
    setWordbook(prev => prev.filter(w => w.word !== wordStr));
  };

  const removeWordInstance = (wordStr: string, videoId?: string, contextStart?: number) => {
    setWordbook(prev => prev.filter(w => {
      // If it's the exact instance, filter it out (return false)
      const isMatch = w.word === wordStr && w.videoId === videoId && w.contextStart === contextStart;
      return !isMatch;
    }));
  };

  const updateWordLevel = (wordStr: string, level: WordEntry['level']) => {
    setWordbook(prev => prev.map(w => w.word === wordStr ? { ...w, level } : w));
  };

  const toggleIgnoreWord = (wordStr: string) => {
    setIgnoredWords(prev => {
      const normalized = wordStr.toLowerCase();
      if (prev.includes(normalized)) {
        return prev.filter(w => w !== normalized);
      } else {
        return [...prev, normalized];
      }
    });
    setWordbook(prev => prev.filter(w => w.word.toLowerCase() !== wordStr.toLowerCase()));
  };

  const handleStartLesson = (lesson: VideoLesson) => {
    setActiveLesson(lesson);
    setTrackedVideos(prev => {
      if (prev.find(v => v.id === lesson.id)) return prev;
      return [{ ...lesson, status: 'learning' }, ...prev];
    });
    setCurrentView(View.WATCH);
  };

  const handleRemoveLesson = (id: string) => {
    setTrackedVideos(prev => prev.filter(v => v.id !== id));
  };

  const updateVideoStatus = (id: string, status: 'learning' | 'achieved') => {
    setTrackedVideos(prev => prev.map(v => v.id === id ? { ...v, status } : v));
  };

  return (
    <div className="min-h-screen flex flex-col bg-app-bg text-app-text-main transition-colors duration-300">
      
      {/* Top Header - Contains Logo, Desktop Navigation, and User Controls */}
      <Header 
        currentView={currentView}
        onViewChange={setCurrentView}
        wordCount={wordbook.filter(w => w.level === 'mastered' || w.level === 'achieved').length}
        nativeLanguage={nativeLanguage}
        learningLanguage={learningLanguage}
        onNativeChange={setNativeLanguage}
        onLearningChange={setLearningLanguage}
        userProfile={userProfile}
        isDark={isDark}
        onToggleTheme={() => setIsDark(!isDark)}
        onAddWord={addWord}
      />

      {/* Main Content Area - Full width */}
      <main className="flex-1 w-full pb-24 md:pb-12">
        <div className="h-full">
          {currentView === View.EXPLORE && (
            <ExploreView onStartLesson={handleStartLesson} />
          )}
          {currentView === View.WATCH && activeLesson && (
            <WatchView 
              lesson={activeLesson} 
              wordbook={wordbook} 
              trackedVideos={trackedVideos}
              onAddWord={addWord} 
            />
          )}
          {currentView === View.LEARN && (
            <LearnView 
              words={wordbook} 
              ignoredWords={ignoredWords}
              videos={trackedVideos}
              onRemoveWord={removeWord}
              onRemoveInstance={removeWordInstance}
              onUpdateWordLevel={updateWordLevel}
              onToggleIgnore={toggleIgnoreWord}
              onStartLesson={handleStartLesson}
              onRemoveLesson={handleRemoveLesson}
              onUpdateVideoStatus={updateVideoStatus}
            />
          )}
          {currentView === View.PLAY && (
            <GamesView words={wordbook} trackedVideos={trackedVideos} />
          )}
          {currentView === View.DAO && (
            <DaoView userProfile={userProfile} />
          )}
        </div>
      </main>

      {/* Footer - Minimalist */}
      <footer className="bg-app-bg border-t border-app-border py-8 px-4 transition-colors duration-300 hidden md:block">
        <div className="max-w-7xl mx-auto text-center">
          <div className="text-lg font-black text-app-accent mb-1 uppercase tracking-[0.2em]">YouLangua</div>
          <div className="text-app-text-sub text-[10px] font-black uppercase opacity-40">
            The Path to Digital Enlightenment &copy; {new Date().getFullYear()}
          </div>
        </div>
      </footer>

      {/* Mobile Bottom Navigation - Only visible on small screens */}
      <Navbar 
        currentView={currentView} 
        onViewChange={setCurrentView} 
      />
    </div>
  );
};

export default App;
