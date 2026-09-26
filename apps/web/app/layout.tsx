import type {Metadata} from 'next';
import './styles.css';
export const metadata:Metadata={title:'Writing Studio | AI Writing Platform',description:'Private, scope-checked writing assessment workspace'};
export default function RootLayout({children}:{children:React.ReactNode}){
  return <html lang="en"><body>{children}</body></html>;
}
