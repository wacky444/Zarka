import os
from PIL import Image

OUTPUT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    'client',
    'public',
    'assets',
    'images',
    'Board Game Icons'
)

# 32x32 ASCII Art definitions
# '@' represents solid white pixels, ' ' represents transparent pixels.

ASCII_ICONS = {
    'binoculars': (
        """
                                
                                
    @@@@@@            @@@@@@    
   @@@@@@@@          @@@@@@@@   
   @@@  @@@          @@@  @@@   
   @@@@@@@@   @@@@   @@@@@@@@   
    @@@@@@   @@@@@@   @@@@@@    
    @@@@@@   @@@@@@   @@@@@@    
    @@@@@@    @@@@    @@@@@@    
    @@@@@@   @@@@@@   @@@@@@    
    @@@@@@@  @@@@@@  @@@@@@@    
    @@@@@@@  @@@@@@  @@@@@@@    
   @@@@@@@@@  @@@@  @@@@@@@@@   
   @@@@@@@@@  @@@@  @@@@@@@@@   
  @@@@@@@@@@@      @@@@@@@@@@@  
  @@@@@@@@@@@      @@@@@@@@@@@  
  @@@@@@@@@@@      @@@@@@@@@@@  
  @@@@@@@@@@@      @@@@@@@@@@@  
  @@@@@@@@@@@      @@@@@@@@@@@  
  @@@@@@@@@@@      @@@@@@@@@@@  
  @@@@@@@@@@@      @@@@@@@@@@@  
  @@@@@@@@@@@      @@@@@@@@@@@  
  @@@@@  @@@@      @@@@@  @@@@  
  @@@@    @@@      @@@@    @@@  
  @@@@    @@@      @@@@    @@@  
  @@@@@  @@@@      @@@@@  @@@@  
  @@@@@@@@@@@      @@@@@@@@@@@  
   @@@@@@@@@        @@@@@@@@@   
                                
                                
                                
                                
""".strip('\r\n'),
        ['binoculars.png']
    ),

    'bandage': (
        """
                                
                                
   @@@@                    @@@@ 
  @@@@@@                  @@@@@@
  @@@  @@@              @@@  @@@
  @@@  @@@              @@@  @@@
   @@@@@@@@            @@@@@@@@ 
    @@@@@@@@          @@@@@@@@  
     @@@@@@@@        @@@@@@@@   
      @@@@@@@@      @@@@@@@@    
       @@@@@@@@    @@@@@@@@     
        @@@@@@@@@@@@@@@@@@      
         @@@@@      @@@@@       
         @@@@   @@   @@@@       
         @@@@  @@@@  @@@@       
         @@@@  @@@@  @@@@       
         @@@@   @@   @@@@       
         @@@@@      @@@@@       
        @@@@@@@@@@@@@@@@@@      
       @@@@@@@@    @@@@@@@@     
      @@@@@@@@      @@@@@@@@    
     @@@@@@@@        @@@@@@@@   
    @@@@@@@@          @@@@@@@@  
   @@@@@@@@            @@@@@@@@ 
  @@@  @@@              @@@  @@@
  @@@  @@@              @@@  @@@
  @@@@@@                  @@@@@@
   @@@@                    @@@@ 
                                
                                
                                
                                
""".strip('\r\n'),
        ['bandage.png']
    ),

    'throw': (
        """
                                
                                
                         @@@@@  
                       @@@@@@@@ 
                      @@@@@@@@@@
                      @@@@@@@@@@
                      @@@@@@@@@@
                       @@@@@@@@ 
             @@@@       @@@@@   
           @@@@@@@@             
          @@@@  @@@@            
         @@@@    @@@@           
    @@   @@@      @@@@          
   @@@@  @@@       @@@@         
   @@@@@ @@@        @@@@        
    @@@@@@@@         @@@        
     @@@@@@@@        @@@@       
      @@@@@@@@@      @@@@       
     @@@@@@@@@@@    @@@@        
    @@@@@@@@@@@@@@@@@@@         
   @@@@@@@@@@@@@@@@@@@          
  @@@@@@@@@@@@@@@@@@            
 @@@@@@@@@@@@@@@@               
 @@@@@@@@@@@@@                  
  @@@@@@@@@@                    
   @@@@@@@                      
    @@@@@                       
     @@@                        
                                
                                
                                
                                
""".strip('\r\n'),
        ['throw.png']
    ),

    'bat': (
        """
                                
                         @@@@   
                       @@@@@@@  
                     @@@@@@@@@@ 
             @@     @@@@@@@@@@@ 
            @@@@   @@@@@@@@@@@@ 
             @@@@ @@@@@@@@@@@@  
        @@    @@@@@@@@@@@@@@@   
       @@@@  @@@@@@@@@@@@@@@    
        @@@@@@@@@@@@@@@@@@@     
         @@@@@@@@@@@@@@@@@      
          @@@@@@@@@@@@@@@   @@  
          @@@@@@@@@@@@@@@  @@@@ 
           @@@@@@@@@@@@@  @@@@  
            @@@@@@@@@@@    @@   
             @@@@@@@@@          
              @@@@@@@           
              @@ @@@            
             @@@  @@            
            @@@  @@@            
           @@@  @@@             
          @@@  @@@              
         @@@  @@@               
        @@@  @@@                
       @@@  @@@                 
      @@@  @@@                  
     @@@@@@@@                   
    @@@@@@@@                    
    @@@@@@                      
                                
                                
                                
""".strip('\r\n'),
        ['bat.png']
    ),

    'virus': (
        """
                                
              @@@@              
              @@@@              
               @@               
        @@     @@     @@        
       @@@@    @@    @@@@       
        @@@@   @@   @@@@        
         @@@@  @@  @@@@         
    @@@   @@@@@@@@@@@@   @@@    
   @@@@@ @@@@@@@@@@@@@@ @@@@@   
   @@@@@ @@@@@@@@@@@@@@ @@@@@   
    @@@  @@@  @@@@  @@@  @@@    
         @@@  @@@@  @@@         
 @@@@@@@@@@@@      @@@@@@@@@@@   
 @@@@@@@@@@@@      @@@@@@@@@@@   
         @@@  @@@@  @@@         
         @@@  @@@@  @@@         
    @@@  @@@  @@@@  @@@  @@@    
   @@@@@ @@@@@@@@@@@@@@ @@@@@   
   @@@@@ @@@@@@@@@@@@@@ @@@@@   
    @@@   @@@@@@@@@@@@   @@@    
         @@@@  @@  @@@@         
        @@@@   @@   @@@@        
       @@@@    @@    @@@@       
        @@     @@     @@        
               @@               
              @@@@              
              @@@@              
                                
                                
                                
                                
""".strip('\r\n'),
        ['virus.png']
    )
}

def ascii_to_white_png(ascii_str: str) -> Image.Image:
    lines = ascii_str.strip('\r\n').split('\n')
    height = len(lines)
    width = max(len(l) for l in lines)
    raw = Image.new('L', (width, height), 0)
    for y, line in enumerate(lines):
        for x, char in enumerate(line):
            if char in '@#*':
                raw.putpixel((x, y), 255)
    
    # Upscale 8x to 256x256 with bicubic interpolation for smooth vector curves
    large = raw.resize((256, 256), Image.Resampling.BICUBIC)
    # Downscale with Lanczos filter to target 64x64 icon size
    alpha_mask = large.resize((64, 64), Image.Resampling.LANCZOS)
    
    # Pure white (255, 255, 255) icon with alpha mask
    rgba = Image.new('RGBA', (64, 64), (255, 255, 255, 0))
    rgba.putalpha(alpha_mask)
    return rgba

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print("=" * 60)
    print("Generating Action Icons from ASCII Art")
    print(f"Destination: {OUTPUT_DIR}")
    print("=" * 60)
    print()

    for icon_name, (ascii_art, filenames) in ASCII_ICONS.items():
        print(f"--- ASCII Art: {icon_name.upper()} ---")
        print(ascii_art)
        print()

        img = ascii_to_white_png(ascii_art)
        for fn in filenames:
            out_path = os.path.join(OUTPUT_DIR, fn)
            img.save(out_path, 'PNG')
            print(f"[OK] Saved solid white icon to: {out_path}")
        print()

if __name__ == '__main__':
    main()
