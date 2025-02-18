import os
import json
import base64
import numpy as np
from langchain_openai import OpenAIEmbeddings
from typing import List, Dict
from langchain_community.vectorstores import FAISS
from constants import IS_LAMBDA

# Initialize embeddings
embeddings = OpenAIEmbeddings(model="text-embedding-ada-002")

def decode_base64_embedding(b64_string):
    decoded_bytes = base64.b64decode(b64_string)
    return np.frombuffer(decoded_bytes, dtype=np.float32)

examples_directory = os.path.join('/var/task/examples' if IS_LAMBDA else os.path.dirname(__file__), '..', 'examples')
examples_with_embeddings = []

for filename in os.listdir(examples_directory):
    if filename.endswith('.json'):
        with open(os.path.join(examples_directory, filename), 'r') as f:
            examples_with_embeddings.append(json.load(f))

# Create vector store from pre-computed embeddings
texts = [json.dumps({**example['document'], 'embedding': None}) for example in examples_with_embeddings]
embeddings_list = [decode_base64_embedding(example['taskEmbedding']) for example in examples_with_embeddings]
metadatas = [{}] * len(examples_with_embeddings)

# Convert list of numpy arrays to 2D numpy array
embeddings_array = np.array(embeddings_list)

vector_store = FAISS.from_embeddings(
    text_embeddings=list(zip(texts, embeddings_list)),
    embedding=embeddings,
    metadatas=metadatas
)

def get_embedding(text):
    text = text.replace("\n", " ")
    return embeddings.embed_query(text)

def get_relevant_examples(query: str, k: int = 10) -> List[Dict]:
    # Generate embedding for the query using the same model as stored embeddings
    query_embedding = get_embedding(query)
 
    # Perform vector search
    results = vector_store.similarity_search_by_vector(query_embedding, k=k)

    relevant_examples = []
    for doc in results:
        example = json.loads(doc.page_content)
        relevant_examples.append({
            "task": example["task"],
            "code": example["code"]
        })
    
    return relevant_examples