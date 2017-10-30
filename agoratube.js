
var AgoraTube = function (video = null, debug = false) {
	
	/**
	 * Event Dispatcher 
	 */
	// Create a dummy DOM element 
	var dummy = document.createTextNode('');
	
	// Create custom wrappers with nicer names
	this.off = dummy.removeEventListener.bind(dummy);
	this.on = dummy.addEventListener.bind(dummy);
	this.trigger = function(eventName, data){
	    if( !eventName ) return;
	    var e = new CustomEvent(eventName, {"detail":data});
	    dummy.dispatchEvent(e);
	}
	
	/**
	 * Events
	 */
	this.ready = function(readyState) {
		this.trigger('ready', readyState);
	}
	
	this.onupload = function(hash) {
		this.trigger('onupload', hash);
		var percent = this.hashArray.length / (this.totalChunks + 1) * 100;
		this.percentcomplete(percent);
	}
	
	this.ondownload = function(hash) {
		this.trigger('ondownload', hash);
		var percent = this.buffers.length / (this.pointer.hashes.length) * 100;
		this.percentcomplete(percent);
	}
	
	this.pointerfetch = function(pointer) {
		this.trigger('pointerfetch', pointer);
	}
	
	this.downloadcomplete = function(buffers) {
		this.finalDownloaded = true;
		this.trigger('downloadcomplete', buffers)
	}
	
	this.uploadcomplete = function(pointer) {
		this.trigger('uploadcomplete', pointer)
		this.percentcomplete(100);
	}
	
	this.percentcomplete = function(percent) {
		this.trigger('percentcomplete',percent);
	}
	
	
	/**
	 * Methods
	 */
	
	this.getMediaSource = function() {
		var atube = this;
		
		if(this.mediaSource === undefined) {
			window.MediaSource = window.MediaSource || window.WebKitMediaSource;
			if (!!!window.MediaSource) {
			  alert('MediaSource API is not available');
			  return null;
			} else {
				var ms = new MediaSource();
				ms.addEventListener('sourceopen', function(event) {
					var ms = event.currentTarget;
					if(debug) {
						console.log('is it supported', MediaSource.isTypeSupported(atube.mimeCodec));
						console.log('mediaSource readyState: ' + ms.readyState);
					}
					this.sourceBuffer = ms.addSourceBuffer(atube.mimeCodec);
					atube.ready(ms.readyState);
				});
				// If only uploading and not displaying video
				if(video == null) {
					video = document.createElement('video');
				}
				this.video = video;
				video.src = URL.createObjectURL(ms);
				return ms;
			}
		} else {
			return this.mediaSource;
		}		
	};
	
	/**
	 * Slice a blob into chunks
	 * @param {number} megs - number of MB to make each chunk (defaults to 10)
	 * @returns {Array} Array of blobs of size "megs" (except final blob)
	 */
	this.blobToChunks = function(bigBlob, megs = 10) {
		this.mimeType = bigBlob.type;
		var chunkSize = megs * 1000000; // Size of chunks in megs
		var currentStart = 0;
		if(debug)
			console.log('bigBlob',bigBlob);
		this.fileName = bigBlob.name;
		var blobs = [];
		var currentEnd = Math.min(currentStart+chunkSize, bigBlob.size);
		// Chunk file into smaller blobs
		while(currentEnd != bigBlob.size){
			var blobPart = bigBlob.slice(currentStart, currentEnd);
	        blobs.push(blobPart);
	        currentStart = currentEnd;
	        currentEnd =  Math.min(currentStart+chunkSize, bigBlob.size);
		        	  
		}
		// Push final chunk on or single chunk if file is smaller than chunk size
		blobs.push(bigBlob.slice(currentStart, currentEnd));
		// At this point blobs have been chunked and stored in blobs variable
		if(debug)
			console.log(blobs);
		this.blobArray = blobs;
		return blobs;
	}
	
	/**
	 * Gets the start and end time of a SourceBuffer
	 * @param {sourceBuffer} SourceBuffer
	 * @returns {Object} Object with properties "start" and "end" represented as number timestamps
	 */
	this.getBufferedTime = function(sourceBuffer) {
		var start = sourceBuffer.buffered.start(0);
    	var end = sourceBuffer.buffered.end(0);
    	if(debug) {
	    	console.log('buffered timerange start',start);
		    console.log('buffered timerange end',end);
    	}
    	return {'start': start, 'end': end};
	}
	
	/**
	 * Removes the all buffered data of a SourceBuffer
	 * @param {sourceBuffer} SourceBuffer
	 * @returns {Object} Object with properties "start" and "end" represented as number timestamps
	 */
	this.removeTotalBuffer = function(sourceBuffer) {
		var bufferTimes = this.getBufferedTime(sourceBuffer);
		sourceBuffer.remove(bufferTimes.start,bufferTimes.end);
		return bufferTimes;
	}
	
	/**
	 * Adds a file to IPFS
	 * @param {IPFS} node
	 * @param {ArrayBuffer | Array of ArrayBuffers} buffers
	 * @param {String} identifier
	 */
	this.IPFSAdd = function(node, buffers, identifier = ''){
		var atube = this;
		var file = buffers;
		if(Array.isArray(buffers))
			file = buffers.shift();

		node.files.add(new node.types.Buffer(file), (err, res) => {
		    if (err || !res) {
		      return console.error('Error - ipfs files add', err, res)
		    }
  	      	
			res.forEach(function(file){
				if(debug)
					console.log('successfully stored ' + identifier, file);
				
				// Pin to Gateway
	  			fetch('https://ipfs.io/ipfs/'+file.hash).then(function(response) {
	  				if(debug)
	  					console.log('pinned ' + identifier, response)
	  			}).catch(function(err) {
	  				// Error :(
	  			});
	  			
	  			if(identifier != 'pointer') {
	  				atube.hashArray.push(file.hash);
	  				//Trigger onupload
	  				atube.onupload(file.hash);
	  				if(atube.hashArray.length == atube.totalChunks)
	  					atube.createPointer(node);
	  			} else {
	  				atube.pointerHash = file.hash;
	  				atube.uploadcomplete(atube.pointer);
	  				atube.percentcomplete(100);
	  			}
	  			
	  			if(Array.isArray(buffers) && buffers.length > 0)
	  				atube.IPFSAdd(node, buffers, identifier + 1);

			});
  	  });
		
	}
	
	/**
	 * Creates The Pointer File
	 * @param {IPFS} node
	 */
	this.createPointer = function(node){
		// show final hash array and timestamp array (in ascending order)
	  	this.timeStampArray.sort(function(a, b){return a - b});
	  	if(debug) {
		  	console.log('timeStampArray',this.timeStampArray)
		  	console.log('hashArray',this.hashArray);
	  	}
	  	// create JSON string out of hashArray
	  	var mimeCodec = mimeCodec = 'video/mp4; codecs="avc3.640028,mp4a.40.2"';
	  	if(this.mimeType != 'video/mp4')
	  		mimeCodec = '';
	  	this.pointer = {'filename':this.fileName, 'mimetype':this.mimeType, 'mimecodec': mimeCodec, 'hashes': this.hashArray, 'timestamps': this.timeStampArray}
	  	var jsonString = JSON.stringify(this.pointer);
	  	if(debug)
	  		console.log('JSON string for pointer:', jsonString);
				
	  	//Hash the json string
	  	this.IPFSAdd(node, jsonString, 'pointer');
	}
	
	/**
	 * Reads chunks and then uploads them (stores hashes in HashArray) and get their timestamps, storing them in timestampArray
	 * @param {Array} blobs - ordered array of blob chunks
	 */
	this.readChunks = function(blobs){
		this.totalChunks = blobs.length;
		var atube = this;
		var reader = new FileReader();
		var sourceBuffer = atube.mediaSource.sourceBuffer;
	  	
		sourceBuffer.onupdateend = function (event) {
		    	
	  		if(event.currentTarget.buffered.length > 0) {
	  				if(debug)
	  					console.log("chunk appended");
		    		bufferTimes = atube.removeTotalBuffer(event.currentTarget);
		    		// The operation was appendBuffer
				    // Push the start position of this chunk onto timeStampArray
				    atube.timeStampArray.push(bufferTimes.start);
		    	} else {
		    		if(debug)
		    			console.log("chunk removed");
		    		if(atube.appendArray.length > 0)
		    			sourceBuffer.appendBuffer(new Uint8Array(atube.appendArray.shift()));
		    		else {
		    			if(debug)
		    				console.log('done getting timestamps');
		    		}
		    		// The operation was remove
		    	}
	  	}
	  	
	    reader.onerror = errorHandler;
	    //reader.onprogress = updateProgress;
	    reader.onabort = function(e) {
	      alert('File read cancelled');
	    };

	    reader.onload = function(e) {
	    	
	   	  atube.appendArray.push(e.currentTarget.result);	
	      
	      // Read the next Blob
	      if(blobs.length > 0) {
	    	  reader.readAsArrayBuffer(blobs.shift());
	      } else {
	    	  var buffers = atube.appendArray.slice();
	    	  // begin uploading chunks to IPFS
	    	  atube.IPFSAdd(node, buffers, 0);
	    	  // Load buffers one by one and get timestamps
	    	  sourceBuffer.appendBuffer(new Uint8Array(atube.appendArray.shift())); 
	      }
	    
		}
		
		// Read in the first file as an arrayBuffer.
		reader.readAsArrayBuffer(blobs.shift());
	}
	
	/**
	 * Begins Uploading Blob
	 * @param {Blob} blob - the Blob to be uploaded
	 */
	this.upload = function(blob){
		var blobs = this.blobToChunks(blob);
		
	  	// Read the blobs: upload to IPFS, store hashes, and store associated start timestamps
		this.readChunks(blobs);
	}
	
	/**
	 * Downloads Pointer JSON from IPFS
	 * @param {IPFS} node
	 * @param {String} hashStr - The hash of the pointer file
	 */
	this.fetchPointer = function(node, hashStr){
		var atube = this;
		//get the JSON
	      node.files.cat(hashStr, function (err, stream) {
		      var res = ''
		      
		      stream.on('data', function (chunk) {
		        res += chunk.toString()
		      })
		
		      stream.on('error', function (err) {
		        console.error('Error - ipfs files cat ', err)
		      })
		
		      stream.on('end', function () {
		    	atube.pointerHash = hashStr;
		    	atube.pointer = JSON.parse(res);
		    	if(debug)
		    		console.log('Pointer:', atube.pointer)
		        
		        // Clear buffer to hold data
		        atube.buffers = [];
		        // start with zero index of pointer hashes
		        atube.pointerIndex = 0;
		        
		        atube.setListeners();
		        
		        atube.pointerfetch(atube.pointer);
		        
		      })
		    })
	}
	
	/**
	 * Downloads Hash Chunk and pushes it onto buffers array
	 * @param {Number} hashIndex - The index of the has to be downloaded from pointer.hashes
	 */
	this.pushHash = function(hashIndex) {
		var atube = this;
	    
        // Using the cat method
       	node.files.cat(atube.pointer.hashes[hashIndex], function (err, file) {
       		if(debug)
       			console.log('starting on ' + atube.pointer.hashes[hashIndex]);
       		 atube.buffers[hashIndex] = new Uint8Array;
   		    // push data into ArrayBuffer
   	        file.on('data', (data) => {
   	        		var c = new Uint8Array(atube.buffers[hashIndex].length + data.length);
   	        		c.set(atube.buffers[hashIndex]);
   	        		c.set(data, atube.buffers[hashIndex].length);
   	        		atube.buffers[hashIndex] = c;		
   	        });
   		    
   	        // When stream ends, append chunks to sourceBuffer
   			file.on('end', () => {
   				if(debug) {
	   				console.log('hash index '+ atube.pointerIndex, atube.buffers);
	   				console.log(atube.buffers);
	   			}
   				
   				// Trigger ondownload
   				atube.ondownload(atube.pointer.hashes[hashIndex]);

   				if(atube.action = video) {
	   				// Only begin appending if this is the first chunk
	   				if(atube.video.buffered.length == 0 && atube.video.paused && atube.video.currentTime == 0) {	
	   					if(debug)
	   						console.log('about to append', atube.buffers[0])
	   					atube.sourceBufferFlag = 1;
	   					atube.mediaSource.sourceBuffer.appendBuffer(atube.buffers[0]);
	   				}
   				}	
   				
   				// move on to next hash
   				atube.pointerIndex ++;
   				if(atube.buffers[atube.pointerIndex] === undefined) {
   					// If it isn't the last hash, go get the next
   					if(atube.pointerIndex < atube.pointer.hashes.length)
   						atube.pushHash(atube.pointerIndex);
   					else
   						atube.downloadcomplete(atube.buffers);
   				}


   			});

   		})
  		
    }
	
	/**
	 * Sets the required listeners when this.action = 'video'
	 */
	this.setVideoListeners = function() {
		var atube = this;
		var sourceBuffer = atube.mediaSource.sourceBuffer;
		
		// Video Event Listeners
		atube.video.addEventListener("timeupdate", function(event) {
	    	// Next closest chunk starting point
	    	var vid = new VideoState(atube.video, atube.pointer);
	    	
	    	//console.log('buffered timerange = ' + vid.getBufStart() + ' - ' + vid.getBufEnd());
	    	
	    	// Add next required chunk
	    	if(vid.getBufEnd() < vid.closestStart.timestamp && vid.getBufEnd() > 0) {
	    		if(debug)
	    			console.log("next section needs downloading");
	    		// If that section hasn't yet been downloaded
	    		if(atube.buffers[vid.closestStart.index] === undefined) {
	    			if(debug)
	    				console.log("buffers[" + vid.closestStart.index + "] doesn't exist");
	    			// Go fetch the data and buffer it
	    		} else {
	    			// If the section has been downloaded
	    			if(debug)
	    				console.log(atube.buffers);
	    			//console.log("length next = " + buffers[closestStart.index].length + ", length current = " + buffers[currentSection].length);
	    			if(atube.buffers[vid.closestStart.index + 1] != undefined || atube.finalDownloaded) {
						atube.sourceBufferFlag = 1;
	   					sourceBuffer.appendBuffer(atube.buffers[vid.closestStart.index]);
	    			}
	    			
	    		}
	    	}
	    	
	    	/*** SEEKING REMOVED. CODE BLOCK IS NOT FUNCTIONAL
	    	// Seeking
	    	if(atube.video.currentTime > vid.getBufEnd() || atube.video.currentTime < vid.getBufStart()) {
	    		if(debug)
	    			console.log("seek beyond buffer");
	    		
	    		if(atube.video.buffered.length > 0) {
	    			console.log("in remove spot");
	    			bufferPlaceholder = []
	    			if(!sourceBuffer.updating) {
	    				atube.sourceBufferFlag = 2;
	    				sourceBuffer.remove(vid.getBufStart(),vid.getBufEnd());
	    			}
	    		} 
	    	} */
	    	
		}, true); // end event listener for timeupdate 

		
		
		// SourceBuffer Listener - Handle SourceBuffer Update
	    sourceBuffer.onupdateend = function (event) {
	    	var sb = event.currentTarget;
	    	var start = sb.buffered.start(0);
	    	var end = sb.buffered.end(0);
	    	var vid = new VideoState(atube.video, atube.pointer);
	    	
	    	switch (atube.sourceBufferFlag) {
	    	  case 1:
	    		//Append
	    		if(debug)
	    			console.log("appending chunk");
    			// Final chunk has been appended. Clean up already watched video
    		  	if(debug)
    				console.log('buffered timerange = ' + start + ' - ' + end);
				if(start < atube.pointer.timestamps[vid.currentSection] && end > 0 && vid.currentSection > 0) {
        				// Set flag and remove watched video
        				// Must round the endpoint down in seconds
        				var end = Math.floor(atube.pointer.timestamps[vid.currentSection]);
        				if(debug)
        					console.log('removing watched video from ' + start + ' - ' + end);
        				atube.sourceBufferFlag = 2;
        				sb.remove(start, end);
	        	}
	    	    break;
	    	  
	    	  case 2:
	    		if(debug)
	    			console.log('buffered timerange = ' + start + ' - ' + end);
	    		
	    		/*** SEEKING FUNCTIONALITY. NOT FUNCTIONAL
	    		// Full Remove was executed, add current chunk
	    		if(end == 0) {
	    			if(atube.buffers[vid.currentSection] === undefined) {
	        			console.log("buffers[" + vid.currentSection + "] doesn't exist");
	        			// Go fetch the data and buffer it
	        			atube.pointerIndex = vid.currentSection;
	        			atube.pushHash(atube.pointerIndex);
	        		} else {
	        			console.log("After full buffer remove, adding current section");
						//sourceBufferFlag = 1;
	   					//sb.appendBuffer(buffers[vid.currentSection]);
	        		}
	    		} */
	    	    
	    	    break;

	    	  default:
	    		if(debug)
	    			console.log('sourceBufferFlag set to '+ atube.sourceBufferFlag);
	    	}	
		  }; // end sourceBuffer.onupdateend
	}
	
	/**
	 * Sets the required listeners
	 */
	this.setListeners = function() {
		switch(atube.action) {
		
			case "video":
				this.setVideoListeners();
				break;
				
			case "download":
				break;
				
			default:
				console.log("action set to" + this.action)
		}
	}
	
	/**
	 * Sets the required listeners when this.action = 'video'
	 * @param {String} fileName - The name you want the file to be downloaded as
	 */
	this.downloadBuffer = function(fileName){
		var newBlob = new Blob(this.buffers, {type: this.pointer.mimetype});
		if(debug)
			console.log('Full file', newBlob);
		// Download
		var a = document.createElement("a");
	    document.body.appendChild(a);
	    a.style = "display: none";
		var url = window.URL.createObjectURL(newBlob);
        a.href = url;
        a.download = this.pointer.filename;
        a.click();
        window.URL.revokeObjectURL(url);
	}
	
	/**
	 * Properties
	 */
	this.video;
	this.mediaSource = this.getMediaSource();
	this.pointer;
	this.pointerIndex = 0;
	this.fileName;
	this.mimeType;
	this.mimeCodec = 'video/mp4; codecs="avc3.640028,mp4a.40.2"'; // Only works with DASH formatted MP4s
	this.pointerHash;
	this.totalChunks = 0;
	this.timeStampArray = [];
	this.hashArray = [];
	this.blobArray = [];
	this.appendArray = [];
	this.buffers = [];
	this.sourceBufferFlag = 0; // 0 = reset/idle ; 1 = appending ; 2 = removing
	this.finalDownloaded = false;
	this.action; // "download" or "video"
	
}


//Helper Functions
/**
* Returns the next closest timestamp from a timestamp array.
**/
function VideoState(video, pointer) {
	this.closestStart = closest(pointer.timestamps, video.currentTime);
	this.currentSection = this.closestStart.index - 1;
	this.getBufStart = function() {
		if(video.buffered.length > 0)
			return video.buffered.start(0);
		else
			return 0;
	}
	this.getBufEnd = function() {
		if(video.buffered.length > 0)
			return video.buffered.end(0);
		else
			return 0;
	}
}
	
function closest(arr, target) {
    if (!(arr) || arr.length == 0)
        return null;
    if (arr.length == 1)
        return arr[0];

    for (var i=1; i<arr.length; i++) {
        // As soon as a number bigger than target is found, return the previous or current
        // number depending on which has smaller difference to the target.
        if (arr[i] > target) {
            var c = arr[i]
            // return an object with the index of the hash and its starting timestamp
            return {"index":i,"timestamp":c};
        }
    }
    // No number in array is bigger so return the last.
    return arr[arr.length-1];
}

//Parse the GET variables 
var $_GET = {};
	if(document.location.toString().indexOf('?') !== -1) {
	    var query = document.location
	                   .toString()
	                   // get the query string
	                   .replace(/^.*?\?/, '')
	                   // and remove any existing hash string (thanks, @vrijdenker)
	                   .replace(/#.*$/, '')
	                   .split('&');
	
	    for(var i=0, l=query.length; i<l; i++) {
	       var aux = decodeURIComponent(query[i]).split('=');
	       $_GET[aux[0]] = aux[1];
	    }
	}