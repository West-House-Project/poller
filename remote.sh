BNAME=`basename $(pwd)`

cd ..

PATH=$PATH:/usr/local/bin

export PATH

rm ~/repositories/$BNAME.tar.gz

/usr/local/bin/forever stop ~/westhouse-bin/$BNAME/app.js

rm -rf ~/westhouse-bin/$BNAME

mv $BNAME ~/westhouse-bin

POLLER_ENV="production"
export POLLER_ENV
/usr/local/bin/forever start ~/westhouse-bin/$BNAME/app.js