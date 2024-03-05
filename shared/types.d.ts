type Result = {
  author: string;
  author_details: {
    name: string;
    username: string;
    avatar_path: string |null;
    rating: number | null; 
  };
  content: string;
  created_at?: string; 
  id?: string;
  updated_at?: string; 
  url: string;
};

export type Review = {
  id: number; 
  results: Result[]; 
};
