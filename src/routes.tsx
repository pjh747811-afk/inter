import type { RouteObject } from 'react-router';
import App from './App';
import Home from './pages/Home';
import { SurveyResponse } from './pages/Surveys';

export const routes: RouteObject[] = [
  {
    element: <App />,
    children: [
      { path: '/survey/:id', element: <SurveyResponse /> },
      { path: '*', element: <Home /> },
    ],
  },
];
