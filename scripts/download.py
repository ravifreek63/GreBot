import requests
import pandas as pd

url = 'https://www.graduateshotline.com/gre-word-list.html#x5'
html = requests.get(url).content
df_list = pd.read_html(html)
df = df_list[0]
print len(df_list)
print df
df.to_csv('my data.csv')
