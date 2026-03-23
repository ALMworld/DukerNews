
import { VideoLesson, TargetTask } from "./types";

export const FEATURED_LESSONS: VideoLesson[] = [
  {
    id: "ted-1",
    title: "How to stay calm under pressure",
    url: "https://www.youtube.com/watch?v=hnpQrMqDoqE",
    thumbnail: "https://picsum.photos/seed/ted1/600/400",
    language: "English",
    transcript: [
      { start: 0, duration: 3, text: "Welcome to this TED talk about focus." },
      { start: 3, duration: 3, text: "Today we will learn how to handle stress." },
      { start: 6, duration: 4, text: "Pressure is a privilege that we must manage carefully." },
      { start: 10, duration: 3, text: "Take a deep breath and clear your mind." },
      { start: 13, duration: 4, text: "The physical symptoms of stress are actually helpful." },
      { start: 17, duration: 3, text: "Your heart is pounding because it is preparing you." },
      { start: 20, duration: 4, text: "It is sending oxygen to your brain for better focus." },
      { start: 24, duration: 3, text: "Shift your mindset from fear to preparation." },
      { start: 27, duration: 4, text: "Notice how your body reacts and embrace the energy." },
      { start: 31, duration: 3, text: "Successful people use this pressure as fuel." },
      { start: 34, duration: 4, text: "It narrows your attention to the task at hand." },
      { start: 38, duration: 3, text: "This is the secret of high-performance athletes." },
      { start: 41, duration: 3, text: "Stay present in the moment and breathe." },
      { start: 44, duration: 4, text: "Visualize your success before you begin." },
      { start: 48, duration: 3, text: "The noise around you doesn't define your path." },
      { start: 51, duration: 3, text: "Consistency is more important than perfection." },
      { start: 54, duration: 3, text: "Now let us look at the brain's neurochemistry." },
      { start: 57, duration: 4, text: "Adrenaline can be your best friend or your enemy." },
      { start: 61, duration: 3, text: "It all depends on how you interpret the signal." }
    ]
  },
  {
    id: "travel-1",
    title: "A Day in Tokyo",
    url: "https://www.youtube.com/watch?v=j_shf_o4u00",
    thumbnail: "https://picsum.photos/seed/tokyo1/600/400",
    language: "English",
    transcript: [
      { start: 0, duration: 4, text: "Tokyo is the largest city in the world." },
      { start: 4, duration: 5, text: "From Shibuya crossing to the quiet shrines." },
      { start: 9, duration: 6, text: "Every street corner has a unique story to tell." },
      { start: 15, duration: 4, text: "The neon lights of Akihabara are mesmerizing." },
      { start: 19, duration: 5, text: "Street food in Shinjuku is a must-try experience." },
      { start: 24, duration: 4, text: "Public transport here is incredibly efficient." },
      { start: 28, duration: 5, text: "People are respectful and the city is very clean." },
      { start: 33, duration: 4, text: "Exploring the hidden alleys of Golden Gai." },
      { start: 37, duration: 5, text: "The contrast between old and new is everywhere." },
      { start: 42, duration: 4, text: "Morning fish markets require a lot of focus." },
      { start: 46, duration: 5, text: "Traditional tea ceremonies offer a moment of zen." },
      { start: 51, duration: 4, text: "Tokyo at night is a sea of digital colors and focus." }
    ]
  },
  {
    id: "cooking-1",
    title: "Perfect Pasta Carbonara",
    url: "https://www.youtube.com/watch?v=D_2DBLAt57c",
    thumbnail: "https://picsum.photos/seed/pasta1/600/400",
    language: "English",
    transcript: [
      { start: 0, duration: 5, text: "Carbonara is a classic Roman dish." },
      { start: 5, duration: 5, text: "You only need four main ingredients." },
      { start: 10, duration: 5, text: "Egg yolks, pecorino, guanciale, and pepper." },
      { start: 15, duration: 5, text: "Focus on the temperature of the pan." },
      { start: 20, duration: 5, text: "The creaminess comes from the emulsion of egg." },
      { start: 25, duration: 4, text: "Stir quickly to avoid making scrambled eggs." },
      { start: 29, duration: 5, text: "Serve immediately while it is hot and glossy." },
      { start: 34, duration: 4, text: "Grating the cheese fresh is non-negotiable." },
      { start: 38, duration: 5, text: "The rendered fat from guanciale is pure gold." },
      { start: 43, duration: 4, text: "Balance the saltiness with extra black pepper." }
    ]
  }
];

export const WORD_TARGETS: TargetTask[] = [
  {
    id: 'cet4',
    name: 'CET4 Core',
    description: 'College English Test Band 4 (China) - Essential vocabulary for university students.',
    words: ['Abandon', 'Ability', 'Aboard', 'Absolute', 'Absorb', 'Abstract', 'Abundant', 'Academic', 'Accelerate', 'Accent'],
    author: 'YouLangua Official',
    category: 'Exam',
    downloads: 12500,
    createdAt: Date.now() - 1000000000,
    maintainedBy: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'
  },
  {
    id: 'cet6',
    name: 'CET6 Advanced',
    description: 'Advanced vocabulary for Band 6 aspirants targeting high proficiency.',
    words: ['Adhere', 'Adjacent', 'Adjoin', 'Adjust', 'Administer', 'Adolescent', 'Adopt', 'Adore', 'Adorn', 'Advancement'],
    author: 'YouLangua Official',
    category: 'Exam',
    downloads: 8900,
    createdAt: Date.now() - 900000000,
    maintainedBy: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'
  },
  {
    id: 'ielts',
    name: 'IELTS Band 8+',
    description: 'Sophisticated adjectives and verbs to boost your writing score.',
    words: ['Ambiguous', 'Analogy', 'Arbitrary', 'Bias', 'Coherent', 'Crucial', 'Deviate', 'Elicit', 'Feasible', 'Hinder'],
    author: 'BritishCouncilFan',
    category: 'Exam',
    downloads: 24000,
    createdAt: Date.now() - 500000000,
    maintainedBy: '0x82A7656EC7ab88b098defB751B7401B5f6d89321'
  },
  {
    id: 'toefl',
    name: 'TOEFL Academic',
    description: 'Must-know words for reading comprehension in science and history.',
    words: ['Acquire', 'Affirm', 'Constraint', 'Decipher', 'Elaborate', 'Fragment', 'Illuminate', 'Legacy', 'Magnify', 'Notable'],
    author: 'YouLangua Official',
    category: 'Exam',
    downloads: 15200,
    createdAt: Date.now() - 1200000000,
    maintainedBy: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'
  },
  {
    id: 'tech-startup',
    name: 'Silicon Valley Lingo',
    description: 'Speak the language of startups, venture capital, and agile development.',
    words: ['Bootstrap', 'Churn', 'Disrupt', 'Ecosystem', 'Freemium', 'Iteration', 'Pivot', 'Scalable', 'Traction', 'Valuation'],
    author: 'TechCruncher',
    category: 'Business',
    downloads: 5300,
    createdAt: Date.now() - 200000000,
    maintainedBy: '0x32B1656EC7ab88b098defB751B7401B5f6d81234'
  },
  {
    id: 'coffee-lover',
    name: 'Barista Basics',
    description: 'Order like a pro in any cafe around the world.',
    words: ['Arabica', 'Barista', 'Brew', 'Crema', 'Espresso', 'Extraction', 'Froth', 'Grind', 'Roast', 'Single-origin'],
    author: 'CoffeeSnob99',
    category: 'Lifestyle',
    downloads: 2100,
    createdAt: Date.now() - 100000000,
    maintainedBy: '0x55C7656EC7ab88b098defB751B7401B5f6d89999'
  }
];
