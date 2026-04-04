import sys
import os

# Add current directory to path
sys.path.append(os.getcwd())

from Components.Neo4jManager import Neo4jManager
from config import settings

def test_neo4j():
    print(f"Connecting to {settings.NEO4J_URI}...")
    mgr = Neo4jManager(settings.NEO4J_URI, settings.NEO4J_USER, settings.NEO4J_PASSWORD)
    
    if not mgr.is_connected():
        print("❌ Failed to connect to Neo4j")
        return

    print("✅ Connected to Neo4j")

    # Test Write
    print("Testing write...")
    try:
        with mgr.driver.session() as session:
            session.run("MERGE (n:TestNode {id: 'verify'}) SET n.status = 'working'")
        print("✅ Write successful")
    except Exception as e:
        print(f"❌ Write failed: {e}")

    # Test Read
    print("Testing read...")
    try:
        with mgr.driver.session() as session:
            result = session.run("MATCH (n:TestNode {id: 'verify'}) RETURN n.status")
            record = result.single()
            if record and record[0] == 'working':
                print("✅ Read successful")
            else:
                print("❌ Read failed (data not found)")
    except Exception as e:
        print(f"❌ Read failed: {e}")

    # Cleanup
    mgr.clear_graph(scan_id="test") # Won't delete TestNode
    with mgr.driver.session() as session:
        session.run("MATCH (n:TestNode {id: 'verify'}) DELETE n")
    print("✅ Cleanup successful")
    mgr.close()

if __name__ == "__main__":
    test_neo4j()
